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

// Version comparison — the client half of difference_service's §8 contract.
//
// The service answers off a stored manifest, and each status implies a DIFFERENT
// action here. Collapsing them into "worked / didn't" would lose exactly the
// information the contract exists to carry:
//
//   ready        render the diff
//   pending      poll; generation was queued (a diff takes tens of seconds)
//   failed       fall back to a plain side-by-side — the diff itself is broken,
//                but the two versions are still perfectly viewable
//   unsupported  nothing to compute (raster images): flip between versions
//                locally. NOT an error, and showing one would be wrong.
//   none         a first version has no predecessor and never will — stop asking
//
// The diff CONTENT is not fetched from this service: results are stored as hidden
// children of the source file, so the bytes come from the ordinary file surface
// and inherit the source file's ACLs.
import differenceClient, { errorMessage } from '@/services/differenceClient'

export type DiffStatus = 'ready' | 'pending' | 'failed' | 'unsupported' | 'none'

/** Fidelity tier of one unit (page / model). */
export type DiffMode = 'vector' | 'hybrid' | 'raster' | 'xkt' | 'mixed' | 'unavailable'

export interface DiffUnit {
  index: number
  mode: DiffMode
  kind: string
}

export interface DiffChildRef {
  index: number
  name: string
  /** Rendition uid — fetch the bytes through the normal file surface. */
  uid: string
  mode: DiffMode
  kind: string
}

export interface DiffManifest {
  status: string
  mode: DiffMode
  file_uid: string
  base_version: string
  target_version: string
  plugin: string
  plugin_version: number
  key: string
  units: DiffUnit[]
  expected: string[]
  failure?: { stage?: string; reason?: string; tiers_attempted?: string[] }
}

export interface DiffResponse {
  status: DiffStatus
  fileUid: string
  baseVersion: string
  targetVersion: string
  /** Present when `ready`. */
  manifest?: DiffManifest
  /** Present when `ready` — what to fetch, in unit order. */
  children: DiffChildRef[]
  /** Present when `failed`. */
  failure?: { stage?: string; reason?: string; tiers_attempted?: string[] }
  /** Present when `unsupported` — the type that has no differ. */
  mime?: string
  /** Present when `none` / `unsupported` — why there is nothing to show. */
  detail?: string
  /** True when the service is 3D (a single XKT model rather than page images). */
  is3d: boolean
}

export interface DiffQuery {
  /** Target version; omitted means the newest. */
  version?: string
  /** Explicit base; omitted means the target's immediate predecessor. */
  base?: string
}

function normalize(body: Record<string, unknown>, status: number): DiffResponse {
  const manifest = (body.manifest ?? undefined) as DiffManifest | undefined
  const children = ((body.children ?? []) as DiffChildRef[]) || []
  const declared = String(body.status ?? '')
  // A 422 is the transport signal for "failed" even if the body were terse.
  const st: DiffStatus = (status === 422 ? 'failed' : (declared as DiffStatus)) || 'pending'
  return {
    status: st,
    fileUid: String(body.file_uid ?? manifest?.file_uid ?? ''),
    baseVersion: String(body.base_version ?? manifest?.base_version ?? ''),
    targetVersion: String(body.target_version ?? manifest?.target_version ?? ''),
    manifest,
    children,
    failure: (body.failure ?? manifest?.failure) as DiffResponse['failure'],
    mime: body.mime ? String(body.mime) : undefined,
    detail: body.detail ? String(body.detail) : undefined,
    // 3D results are a single model child plus a metamodel; 2D results are pages.
    is3d: (manifest?.mode === 'xkt') || children.some((c) => c.kind === 'model'),
  }
}

export const differenceService = {
  /** One request. Returns the status as-is — the caller decides whether to poll. */
  async get(fileUid: string, query: DiffQuery = {}): Promise<DiffResponse> {
    const params: Record<string, string> = {}
    if (query.version) params.version = query.version
    if (query.base) params.base = query.base
    const res = await differenceClient.get(`/files/${fileUid}/diff`, { params })
    return normalize(res.data ?? {}, res.status)
  },

  /**
   * Request, then poll while the service reports `pending`.
   *
   * Polling rather than a long-held request is the service's own contract: a BIM
   * or PDF comparison takes tens of seconds, so the request returns 202 and the
   * work continues server-side. `onProgress` lets the UI show that honestly
   * instead of freezing.
   *
   * Stops on ANY terminal status — including `failed`, `unsupported` and `none`,
   * which are answers, not reasons to keep asking.
   */
  async getWhenReady(
    fileUid: string,
    query: DiffQuery = {},
    opts: {
      intervalMs?: number
      timeoutMs?: number
      signal?: AbortSignal
      onProgress?: (attempt: number) => void
    } = {},
  ): Promise<DiffResponse> {
    const interval = opts.intervalMs ?? 1500
    const deadline = Date.now() + (opts.timeoutMs ?? 180_000)
    let attempt = 0

    for (;;) {
      if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError')
      const res = await this.get(fileUid, query)
      if (res.status !== 'pending') return res

      attempt += 1
      opts.onProgress?.(attempt)
      if (Date.now() + interval > deadline) {
        // Timing out is not "failed": the work may still be running, and the
        // caller can offer to keep waiting rather than claiming it broke.
        return { ...res, status: 'pending' }
      }
      await new Promise((resolve) => setTimeout(resolve, interval))
    }
  },

  /** Ask the service to backfill missing/stale diffs (tenant admin). */
  async reconcile(maxFiles?: number): Promise<{ status: string; tenant: string }> {
    const { data } = await differenceClient.post('/diff/reconcile',
      maxFiles ? { max_files: maxFiles } : {})
    return data
  },

  /** The child holding the 3D model (`.xkt`/`.glb`), if this is a 3D result. */
  modelChild(res: DiffResponse): DiffChildRef | undefined {
    return res.children.find((c) => c.kind === 'model')
  },

  /** The child holding the xeokit MetaModel, if present. */
  metamodelChild(res: DiffResponse): DiffChildRef | undefined {
    return res.children.find((c) => c.kind === 'metamodel')
  },

  /** Page children in unit order (2D results). */
  pageChildren(res: DiffResponse): DiffChildRef[] {
    return res.children.filter((c) => c.kind === 'page').sort((a, b) => a.index - b.index)
  },
}

export { errorMessage }
