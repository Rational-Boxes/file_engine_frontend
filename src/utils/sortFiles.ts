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
