// Copyright (C) 2026 James Hickman
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Resumable, chunked upload for large files.
 *
 * A single PUT is the right shape for most files and stays the default: one
 * request, no bookkeeping, and the browser already streams it. It is the wrong
 * shape for a big one, because it is ALL OR NOTHING — a connection lost at
 * 900 MB of a 1 GB file starts again at zero, which on a phone or a hotel
 * network is the ordinary case rather than the unlucky one.
 *
 * So above a threshold the file goes up in parts. Each part is its own request
 * and its own retry unit, the server is the record of what landed, and an
 * interrupted upload resumes by asking rather than by guessing.
 *
 * THE SERVER IS THE SOURCE OF TRUTH ABOUT PROGRESS. We remember an upload id
 * locally so a page reload can pick the transfer back up, but we never trust
 * our own idea of which parts arrived — that is fetched. A local record can be
 * stale (another tab, a failed request whose response was lost); the server's
 * cannot.
 *
 * The identity check on resume matters as much as the id. A remembered session
 * is only reused when the file still has the same size and modified time, so
 * editing a file and re-dropping it cannot splice new bytes onto a half-sent
 * older one.
 */
import apiClient from '@/services/apiClient'

/** Files at or above this go up in parts. Below it, one PUT is simpler and faster. */
export const CHUNKED_THRESHOLD_BYTES = 64 * 1024 * 1024   // 64 MiB

/** Part size. Large enough that a big file is not thousands of requests, small
 *  enough that losing one costs little. Must not exceed the server's part cap. */
export const CHUNK_SIZE_BYTES = 8 * 1024 * 1024           // 8 MiB

/** How many times one part is retried before the upload gives up. */
const PART_ATTEMPTS = 3

export interface UploadSessionState {
  upload_id: string
  size: number
  chunk_size: number
  parts: number
  received: number[]
  complete: boolean
  expires_at: number
}

const STORE_KEY = 'fe.uploads'

interface Remembered {
  upload_id: string
  uid: string
  size: number
  lastModified: number
  name: string
}

function readStore(): Record<string, Remembered> {
  try {
    return JSON.parse(window.localStorage.getItem(STORE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeStore(s: Record<string, Remembered>): void {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(s))
  } catch {
    /* storage full or disabled — resume across reloads is a bonus, not a requirement */
  }
}

/** Key a remembered session by what it is FOR, not by when it started. */
export function rememberKey(uid: string, file: { name: string; size: number; lastModified: number }): string {
  return `${uid}:${file.name}:${file.size}:${file.lastModified}`
}

export function remember(uid: string, file: File, upload_id: string): void {
  const s = readStore()
  s[rememberKey(uid, file)] = {
    upload_id, uid, size: file.size, lastModified: file.lastModified, name: file.name,
  }
  writeStore(s)
}

export function forget(uid: string, file: File): void {
  const s = readStore()
  delete s[rememberKey(uid, file)]
  writeStore(s)
}

export function recall(uid: string, file: File): string | null {
  const r = readStore()[rememberKey(uid, file)]
  // The key already pins name/size/lastModified; re-checking the fields guards
  // against a hand-edited or half-written store entry.
  if (!r || r.size !== file.size || r.lastModified !== file.lastModified) return null
  return r.upload_id
}

export const chunkedUpload = {
  /** Which parts a file of this size needs. */
  partCount(size: number, chunkSize: number): number {
    if (size <= 0 || chunkSize <= 0) return 0
    return Math.ceil(size / chunkSize)
  },

  /** The byte range of part `index` — the last one is the remainder. */
  partRange(index: number, size: number, chunkSize: number): [number, number] {
    const start = index * chunkSize
    return [start, Math.min(start + chunkSize, size)]
  },

  async open(uid: string, size: number, chunkSize: number): Promise<UploadSessionState> {
    const { data } = await apiClient.post<UploadSessionState>(
      `/v1/files/${uid}/uploads`, { size, chunk_size: chunkSize })
    return data
  },

  async status(uid: string, uploadId: string): Promise<UploadSessionState | null> {
    try {
      const { data } = await apiClient.get<UploadSessionState>(`/v1/files/${uid}/uploads/${uploadId}`)
      return data
    } catch {
      return null   // expired, finished, or never ours — start a fresh one
    }
  },

  async putPart(uid: string, uploadId: string, index: number, blob: Blob): Promise<void> {
    await apiClient.put(`/v1/files/${uid}/uploads/${uploadId}/parts/${index}`, blob, {
      headers: { 'Content-Type': 'application/octet-stream' },
    })
  },

  async commit(uid: string, uploadId: string): Promise<void> {
    await apiClient.post(`/v1/files/${uid}/uploads/${uploadId}/commit`)
  },

  async abort(uid: string, uploadId: string): Promise<void> {
    try {
      await apiClient.delete(`/v1/files/${uid}/uploads/${uploadId}`)
    } catch {
      /* best effort — the server sweeps abandoned sessions anyway */
    }
  },

  /**
   * Send `file` to `uid` in parts, resuming an earlier attempt when there is
   * one. `onProgress` receives 0..100 and counts parts already on the server,
   * so a resumed upload does not restart the bar at zero.
   */
  async upload(
    uid: string,
    file: File,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const chunkSize = CHUNK_SIZE_BYTES
    let session: UploadSessionState | null = null

    const priorId = recall(uid, file)
    if (priorId) session = await this.status(uid, priorId)
    // A remembered session whose chunk_size differs is from an older client;
    // its parts do not line up with the ranges we would send now.
    if (session && session.chunk_size !== chunkSize) session = null

    if (!session) {
      session = await this.open(uid, file.size, chunkSize)
      remember(uid, file, session.upload_id)
    }

    const total = this.partCount(file.size, session.chunk_size)
    const done = new Set<number>(session.received)
    const report = () => onProgress?.(total ? Math.round((done.size / total) * 100) : 100)
    report()

    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError')
      if (done.has(i)) continue   // already on the server — the point of resuming
      const [start, end] = this.partRange(i, file.size, session.chunk_size)
      let lastErr: unknown
      for (let attempt = 0; attempt < PART_ATTEMPTS; attempt++) {
        try {
          await this.putPart(uid, session.upload_id, i, file.slice(start, end))
          lastErr = undefined
          break
        } catch (e) {
          lastErr = e
          // A part is independently retryable — that is the whole reason for
          // sending one at a time. Back off a little so a blip is not turned
          // into three immediate failures.
          if (attempt < PART_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
        }
      }
      if (lastErr) throw lastErr   // the session survives; a later attempt resumes here
      done.add(i)
      report()
    }

    await this.commit(uid, session.upload_id)
    forget(uid, file)
    onProgress?.(100)
  },
}
