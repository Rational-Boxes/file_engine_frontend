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
 * Turning a stored folder uid back into a readable path.
 *
 * Folder actions store destinations as uids — correct, since a uid survives a
 * rename or a move — but the editor was showing the uid raw on any binding not
 * picked in that session, because the label came from the picker and was lost
 * on reload.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { stat } = vi.hoisted(() => ({ stat: vi.fn() }))
vi.mock('@/services/fileService', () => ({ fileService: { stat } }))

import {
  resolveFolderPath, cachedFolderPath, forgetFolderPaths, looksLikeUid,
} from '@/utils/folderPath'

const ROOT = '00000000-0000-0000-0000-000000000000'
const U = (n: number) => `1111111${n}-2222-3333-4444-555555555555`

// A tree: root / Projects / Drawings
const TREE: Record<string, { name: string; parent_uid: string }> = {
  [U(1)]: { name: 'Projects', parent_uid: ROOT },
  [U(2)]: { name: 'Drawings', parent_uid: U(1) },
}

beforeEach(() => {
  forgetFolderPaths()
  stat.mockReset()
  stat.mockImplementation(async (uid: string) => {
    const n = TREE[uid]
    if (!n) throw new Error('not found')
    return { uid, name: n.name, parent_uid: n.parent_uid, type: 'directory' }
  })
})

describe('resolveFolderPath', () => {
  it('walks parents into a readable path', async () => {
    expect(await resolveFolderPath(U(2))).toBe('/Projects/Drawings')
  })

  it('answers "/" for root without calling out', async () => {
    expect(await resolveFolderPath(ROOT)).toBe('/')
    expect(stat).not.toHaveBeenCalled()
  })

  it('returns the uid when the folder cannot be reached', async () => {
    // Deleted, or invisible to this user. Showing the uid is poor but honest —
    // an empty box would read as "no folder configured" when one is.
    const gone = U(9)
    expect(await resolveFolderPath(gone)).toBe(gone)
  })

  it('caches, so a re-render does not re-walk the tree', async () => {
    await resolveFolderPath(U(2))
    const calls = stat.mock.calls.length
    await resolveFolderPath(U(2))
    expect(stat.mock.calls.length).toBe(calls)
    expect(cachedFolderPath(U(2))).toBe('/Projects/Drawings')
  })

  it('shares one walk between concurrent callers', async () => {
    // A form with several folder fields resolves them in the same tick, and
    // their ancestors overlap almost entirely.
    const [a, b] = await Promise.all([resolveFolderPath(U(2)), resolveFolderPath(U(2))])
    expect(a).toBe(b)
    expect(stat.mock.calls.filter((c) => c[0] === U(2)).length).toBe(1)
  })

  it('has nothing cached before it is asked', () => {
    expect(cachedFolderPath(U(2))).toBeUndefined()
  })

  it('does not hang on a corrupt parent chain', async () => {
    // A cycle cannot happen through normal moves, but a bad chain must not
    // spin the form forever.
    stat.mockImplementation(async (uid: string) => ({
      uid, name: 'loop', parent_uid: uid === U(3) ? U(4) : U(3), type: 'directory',
    }))
    const p = await resolveFolderPath(U(3))
    expect(typeof p).toBe('string')
    expect(stat.mock.calls.length).toBeLessThanOrEqual(64)
  })
})

describe('looksLikeUid', () => {
  it('recognises a uid and rejects anything else', () => {
    expect(looksLikeUid(U(1))).toBe(true)
    expect(looksLikeUid(ROOT)).toBe(true)
    // A webhook URL sits in the same config map and must not be mistaken for one.
    expect(looksLikeUid('https://example.com/hook')).toBe(false)
    expect(looksLikeUid('/Projects/Drawings')).toBe(false)
    expect(looksLikeUid('')).toBe(false)
    expect(looksLikeUid(undefined)).toBe(false)
  })
})
