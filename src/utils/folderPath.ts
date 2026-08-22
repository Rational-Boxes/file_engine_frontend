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
 * A folder's human-readable path, from its uid.
 *
 * Configuration stores folder references as uids, which is right — a uid
 * survives a rename or a move, a path does not. But a uid is unreadable, so
 * anything that SHOWS a stored folder has to turn it back into a path. Folder
 * actions were displaying the raw uid on any binding the user had not just
 * picked in that session: the label was remembered from the picker and lost on
 * reload.
 *
 * The core has no "give me the full path" call, so this walks parents and
 * caches. The cache is module-level and keyed by uid because the answer is
 * stable for as long as nobody moves the folder — and if someone does, a stale
 * path in a config summary is a cosmetic wrong, not a functional one; the uid
 * underneath is still correct.
 */
import { fileService } from '@/services/fileService'
import { ROOT_UID } from '@/services/apiClient'

// Resolved paths, and the in-flight promises that produce them. Sharing the
// promise matters: a form with several folder fields resolves them at the same
// moment, and their ancestors overlap almost entirely.
const paths = new Map<string, string>()
const inFlight = new Map<string, Promise<string>>()

/** Root is not a real node; it is the top of the tree and shows as "/". */
const ROOT_PATH = '/'

// A moved folder keeps its uid, so a walk cannot loop — but a corrupt
// parent chain could. Bound it rather than hang the form.
const MAX_DEPTH = 64

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True if `value` looks like a node uid rather than free text. */
export function looksLikeUid(value: unknown): boolean {
  return typeof value === 'string' && UUID_RE.test(value)
}

/** The cached path, or undefined if it has not been resolved yet. */
export function cachedFolderPath(uid: string): string | undefined {
  return paths.get(uid)
}

/**
 * Resolve `uid` to a path like `/Projects/Drawings`.
 *
 * Returns the uid unchanged when it cannot be resolved — a deleted folder, or
 * one the viewer cannot reach. Showing the uid is poor, but it is honest, and
 * far better than an empty box that reads as "no folder configured" when a
 * folder very much is.
 */
export async function resolveFolderPath(uid: string): Promise<string> {
  if (!uid) return ''
  if (uid === ROOT_UID) return ROOT_PATH
  const hit = paths.get(uid)
  if (hit !== undefined) return hit
  const pending = inFlight.get(uid)
  if (pending) return pending

  const work = (async () => {
    const names: string[] = []
    let cur = uid
    try {
      for (let i = 0; cur && cur !== ROOT_UID && i < MAX_DEPTH; i++) {
        // An ancestor already resolved short-circuits the rest of the climb.
        const known = paths.get(cur)
        if (known !== undefined && known !== ROOT_PATH) {
          names.unshift(known.replace(/^\//, ''))
          cur = ROOT_UID
          break
        }
        const info = await fileService.stat(cur)
        names.unshift(info.name)
        cur = info.parent_uid || ROOT_UID
      }
    } catch {
      return uid // unreachable or deleted — say the uid rather than nothing
    }
    const path = names.length ? '/' + names.join('/') : ROOT_PATH
    paths.set(uid, path)
    return path
  })()

  inFlight.set(uid, work)
  try {
    return await work
  } finally {
    inFlight.delete(uid)
  }
}

/** Drop cached paths — for tests, and after a move that would invalidate them. */
export function forgetFolderPaths(): void {
  paths.clear()
  inFlight.clear()
}
