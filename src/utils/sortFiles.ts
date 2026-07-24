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

import type { FileItem } from '@/stores/files'

export type SortKey = 'name' | 'size' | 'created' | 'modified' | 'createdBy' | 'modifiedBy'
export type SortDir = 'asc' | 'desc'

const byName = (a: FileItem, b: FileItem) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })

const byString = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

// Compare two items on the active column, with name as the tiebreak.
function compare(a: FileItem, b: FileItem, key: SortKey): number {
  switch (key) {
    case 'size':
      return a.size - b.size || byName(a, b)
    case 'created':
      return a.createdAt - b.createdAt || byName(a, b)
    case 'modified':
      return a.modifiedAt - b.modifiedAt || byName(a, b)
    case 'createdBy':
      return byString(a.createdBy, b.createdBy) || byName(a, b)
    case 'modifiedBy':
      return byString(a.modifiedBy, b.modifiedBy) || byName(a, b)
    default:
      return byName(a, b)
  }
}

// Order a file listing for display. Folders always sort before files
// (independent of direction — the usual file-manager behaviour); the active
// column then orders within each group, with name as the tiebreak.
export function sortFiles(items: FileItem[], key: SortKey, dir: SortDir): FileItem[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...items].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return compare(a, b, key) * sign
  })
}
