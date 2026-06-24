import type { FileItem } from '@/stores/files'

export type SortKey = 'name' | 'size'
export type SortDir = 'asc' | 'desc'

const byName = (a: FileItem, b: FileItem) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })

// Order a file listing for display. Folders always sort before files
// (independent of direction — the usual file-manager behaviour); the active
// column then orders within each group, with name as the size tiebreak.
export function sortFiles(items: FileItem[], key: SortKey, dir: SortDir): FileItem[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...items].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    const r = key === 'size' ? a.size - b.size || byName(a, b) : byName(a, b)
    return r * sign
  })
}
