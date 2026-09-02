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
 * The resumable uploader.
 *
 * What is worth pinning here is not that a happy-path upload sends every part —
 * it is the behaviour that only shows up when something goes wrong: that a
 * resumed transfer skips what the SERVER says it already has rather than what
 * we remember sending, that a failed part does not silently leave a hole, and
 * that a file which changed under a remembered session is never spliced onto
 * the old one.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// The transport is mocked away entirely. These tests are about the ORDER and
// the decisions — which parts are sent, what is retried, what is committed —
// and letting a real axios instance anywhere near them means the reporter tries
// to serialise its internals when an assertion fails, which fails the run for a
// reason that has nothing to do with the code under test.
vi.mock('@/services/apiClient', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
  API_BASE: '/api',
}))

import {
  chunkedUpload, remember, recall, forget, rememberKey,
  CHUNKED_THRESHOLD_BYTES, CHUNK_SIZE_BYTES,
} from '@/services/chunkedUpload'

function fakeFile(size: number, name = 'big.bin', lastModified = 1000): File {
  // A real Blob would allocate the bytes; only the slicing arithmetic matters.
  return {
    name, size, lastModified,
    slice: (s: number, e: number) => ({ start: s, end: e, size: e - s }) as unknown as Blob,
  } as unknown as File
}

beforeEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('part arithmetic', () => {
  it('counts a short final part', () => {
    expect(chunkedUpload.partCount(25, 10)).toBe(3)
    expect(chunkedUpload.partCount(30, 10)).toBe(3)
    expect(chunkedUpload.partCount(1, 10)).toBe(1)
    expect(chunkedUpload.partCount(0, 10)).toBe(0)
    expect(chunkedUpload.partCount(10, 0)).toBe(0)
  })

  it('ends the last range at the file, not past it', () => {
    // Slicing past the end would send a short part the server then rejects.
    expect(chunkedUpload.partRange(0, 25, 10)).toEqual([0, 10])
    expect(chunkedUpload.partRange(2, 25, 10)).toEqual([20, 25])
  })

  it('covers the file exactly, with no gap or overlap', () => {
    const size = 25, chunk = 10
    let covered = 0
    for (let i = 0; i < chunkedUpload.partCount(size, chunk); i++) {
      const [s, e] = chunkedUpload.partRange(i, size, chunk)
      expect(s).toBe(covered)
      covered = e
    }
    expect(covered).toBe(size)
  })
})

describe('remembering a session across reloads', () => {
  it('recalls a session for the same file', () => {
    const f = fakeFile(100)
    remember('uid-1', f, 'abc')
    expect(recall('uid-1', f)).toBe('abc')
  })

  it('does NOT recall it for a file that changed', () => {
    // The decisive one: reusing a session after an edit would splice new bytes
    // onto a half-sent older file and commit something that never existed.
    const f = fakeFile(100, 'big.bin', 1000)
    remember('uid-1', f, 'abc')
    expect(recall('uid-1', fakeFile(101, 'big.bin', 1000))).toBeNull()   // size changed
    expect(recall('uid-1', fakeFile(100, 'big.bin', 2000))).toBeNull()   // mtime changed
    expect(recall('uid-1', fakeFile(100, 'other.bin', 1000))).toBeNull() // different file
  })

  it('does not recall it for a different target', () => {
    const f = fakeFile(100)
    remember('uid-1', f, 'abc')
    expect(recall('uid-2', f)).toBeNull()
  })

  it('forgets on request, and survives a corrupt store', () => {
    const f = fakeFile(100)
    remember('uid-1', f, 'abc')
    forget('uid-1', f)
    expect(recall('uid-1', f)).toBeNull()
    window.localStorage.setItem('fe.uploads', 'not json')
    expect(recall('uid-1', f)).toBeNull()
  })

  it('keys by what the session is for', () => {
    expect(rememberKey('u', fakeFile(10, 'a.bin', 5))).toBe('u:a.bin:10:5')
  })
})

describe('uploading', () => {
  it('sends every part, then commits', async () => {
    const f = fakeFile(25, 'x', 1)
    const sent: number[] = []
    vi.spyOn(chunkedUpload, 'open').mockResolvedValue({
      upload_id: 'up1', size: 25, chunk_size: 10, parts: 3, received: [], complete: false, expires_at: 0,
    })
    vi.spyOn(chunkedUpload, 'putPart').mockImplementation(async (_u, _i, idx) => { sent.push(idx) })
    const commit = vi.spyOn(chunkedUpload, 'commit').mockResolvedValue()
    // chunk_size comes from the SESSION, so this test is independent of the
    // module's own constant.
    await chunkedUpload.upload('uid', f)
    expect(sent).toEqual([0, 1, 2])
    expect(commit).toHaveBeenCalledWith('uid', 'up1')
  })

  it('resumes from what the SERVER reports, not from what we remember', async () => {
    // The local note says only "there was a session"; which parts landed is the
    // server's to answer. Trusting a local tally would skip a part that never
    // actually arrived.
    // chunk_size must be the size THIS client uses, or the session is correctly
    // discarded as belonging to an older one — see the chunk-size test below.
    const f = fakeFile(CHUNK_SIZE_BYTES * 3, 'x', 1)
    remember('uid', f, 'up1')
    vi.spyOn(chunkedUpload, 'status').mockResolvedValue({
      upload_id: 'up1', size: CHUNK_SIZE_BYTES * 3, chunk_size: CHUNK_SIZE_BYTES,
      parts: 3, received: [0, 2], complete: false, expires_at: 0,
    })
    const open = vi.spyOn(chunkedUpload, 'open')
    const sent: number[] = []
    vi.spyOn(chunkedUpload, 'putPart').mockImplementation(async (_u, _i, idx) => { sent.push(idx) })
    vi.spyOn(chunkedUpload, 'commit').mockResolvedValue()

    await chunkedUpload.upload('uid', f)
    expect(sent).toEqual([1])          // only the missing one
    expect(open).not.toHaveBeenCalled()
  })

  it('counts already-received parts in the progress it reports', async () => {
    // A resumed upload that restarts its bar at 0% looks like it lost the work.
    const f = fakeFile(CHUNK_SIZE_BYTES * 3, 'x', 1)
    remember('uid', f, 'up1')
    vi.spyOn(chunkedUpload, 'status').mockResolvedValue({
      upload_id: 'up1', size: CHUNK_SIZE_BYTES * 3, chunk_size: CHUNK_SIZE_BYTES,
      parts: 3, received: [0, 1], complete: false, expires_at: 0,
    })
    vi.spyOn(chunkedUpload, 'putPart').mockResolvedValue()
    vi.spyOn(chunkedUpload, 'commit').mockResolvedValue()
    const seen: number[] = []
    await chunkedUpload.upload('uid', f, (p) => seen.push(p))
    expect(seen[0]).toBe(67)           // 2 of 3 before sending anything
    expect(seen[seen.length - 1]).toBe(100)
  })

  it('opens a fresh session when the remembered one is gone', async () => {
    const f = fakeFile(25, 'x', 1)
    remember('uid', f, 'stale')
    vi.spyOn(chunkedUpload, 'status').mockResolvedValue(null)   // expired/unknown
    const open = vi.spyOn(chunkedUpload, 'open').mockResolvedValue({
      upload_id: 'fresh', size: 25, chunk_size: 10, parts: 3, received: [], complete: false, expires_at: 0,
    })
    vi.spyOn(chunkedUpload, 'putPart').mockResolvedValue()
    vi.spyOn(chunkedUpload, 'commit').mockResolvedValue()
    await chunkedUpload.upload('uid', f)
    expect(open).toHaveBeenCalled()
  })

  it('ignores a remembered session whose chunk size no longer matches', async () => {
    // An older client used a different part size, so its parts do not line up
    // with the ranges this one would send. Reusing it would interleave them.
    const f = fakeFile(25, 'x', 1)
    remember('uid', f, 'up1')
    vi.spyOn(chunkedUpload, 'status').mockResolvedValue({
      upload_id: 'up1', size: 25, chunk_size: 7, parts: 4, received: [0], complete: false, expires_at: 0,
    })
    const open = vi.spyOn(chunkedUpload, 'open').mockResolvedValue({
      upload_id: 'fresh', size: 25, chunk_size: CHUNK_SIZE_BYTES, parts: 1, received: [], complete: false, expires_at: 0,
    })
    vi.spyOn(chunkedUpload, 'putPart').mockResolvedValue()
    vi.spyOn(chunkedUpload, 'commit').mockResolvedValue()
    await chunkedUpload.upload('uid', f)
    expect(open).toHaveBeenCalled()
  })

  it('retries a failing part before giving up', async () => {
    const f = fakeFile(10, 'x', 1)
    vi.spyOn(chunkedUpload, 'open').mockResolvedValue({
      upload_id: 'up1', size: 10, chunk_size: 10, parts: 1, received: [], complete: false, expires_at: 0,
    })
    let tries = 0
    vi.spyOn(chunkedUpload, 'putPart').mockImplementation(async () => {
      if (++tries < 3) throw new Error('network blip')
    })
    const commit = vi.spyOn(chunkedUpload, 'commit').mockResolvedValue()
    await chunkedUpload.upload('uid', f)
    expect(tries).toBe(3)
    expect(commit).toHaveBeenCalled()
  })

  it('does NOT commit when a part could not be sent', async () => {
    // Committing a short file would be worse than failing: the server would
    // refuse it anyway, and if it did not, the file would be silently corrupt.
    const f = fakeFile(20, 'x', 1)
    vi.spyOn(chunkedUpload, 'open').mockResolvedValue({
      upload_id: 'up1', size: 20, chunk_size: 10, parts: 2, received: [], complete: false, expires_at: 0,
    })
    vi.spyOn(chunkedUpload, 'putPart').mockRejectedValue(new Error('gone'))
    const commit = vi.spyOn(chunkedUpload, 'commit').mockResolvedValue()
    await expect(chunkedUpload.upload('uid', f)).rejects.toThrow('gone')
    expect(commit).not.toHaveBeenCalled()
  })

  it('keeps the session after a failure, so the next attempt resumes', async () => {
    const f = fakeFile(20, 'x', 1)
    vi.spyOn(chunkedUpload, 'open').mockResolvedValue({
      upload_id: 'up1', size: 20, chunk_size: 10, parts: 2, received: [], complete: false, expires_at: 0,
    })
    vi.spyOn(chunkedUpload, 'putPart').mockRejectedValue(new Error('gone'))
    await expect(chunkedUpload.upload('uid', f)).rejects.toThrow()
    expect(recall('uid', f)).toBe('up1')
  })

  it('forgets the session once it has committed', async () => {
    const f = fakeFile(10, 'x', 1)
    vi.spyOn(chunkedUpload, 'open').mockResolvedValue({
      upload_id: 'up1', size: 10, chunk_size: 10, parts: 1, received: [], complete: false, expires_at: 0,
    })
    vi.spyOn(chunkedUpload, 'putPart').mockResolvedValue()
    vi.spyOn(chunkedUpload, 'commit').mockResolvedValue()
    await chunkedUpload.upload('uid', f)
    expect(recall('uid', f)).toBeNull()
  })
})

describe('the threshold', () => {
  it('is well under the server-side ceilings and a multiple of the chunk', () => {
    expect(CHUNKED_THRESHOLD_BYTES % CHUNK_SIZE_BYTES).toBe(0)
    expect(CHUNK_SIZE_BYTES).toBeLessThanOrEqual(128 * 1024 * 1024)  // server part cap
  })
})
