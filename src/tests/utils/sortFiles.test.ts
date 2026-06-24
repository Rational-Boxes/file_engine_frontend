import { describe, it, expect } from 'vitest'
import { sortFiles } from '@/utils/sortFiles'
import type { FileItem } from '@/stores/files'

const f = (name: string, size: number, isDirectory = false): FileItem =>
  ({ uid: name, name, size, isDirectory, renditionCount: 0, hasRenditions: false }) as FileItem

const names = (items: FileItem[]) => items.map((i) => i.name)

describe('sortFiles', () => {
  it('always lists folders before files (ascending)', () => {
    const items = [f('zebra.txt', 10), f('Alpha', 0, true), f('beta.txt', 5), f('Yak', 0, true)]
    expect(names(sortFiles(items, 'name', 'asc'))).toEqual(['Alpha', 'Yak', 'beta.txt', 'zebra.txt'])
  })

  it('keeps folders first even when descending (only the within-group order flips)', () => {
    const items = [f('Alpha', 0, true), f('beta.txt', 5), f('Yak', 0, true), f('zebra.txt', 10)]
    expect(names(sortFiles(items, 'name', 'desc'))).toEqual(['Yak', 'Alpha', 'zebra.txt', 'beta.txt'])
  })

  it('sorts names case-insensitively and numerically', () => {
    const items = [f('file10.txt', 1), f('file2.txt', 1), f('File1.txt', 1)]
    expect(names(sortFiles(items, 'name', 'asc'))).toEqual(['File1.txt', 'file2.txt', 'file10.txt'])
  })

  it('sorts by size within the file group, name as the tiebreak', () => {
    const items = [f('big.bin', 900), f('small.bin', 10), f('a.bin', 10), f('Docs', 0, true)]
    expect(names(sortFiles(items, 'size', 'asc'))).toEqual(['Docs', 'a.bin', 'small.bin', 'big.bin'])
    expect(names(sortFiles(items, 'size', 'desc'))).toEqual(['Docs', 'big.bin', 'small.bin', 'a.bin'])
  })

  it('does not mutate the input array', () => {
    const items = [f('b', 1), f('a', 1)]
    const copy = [...items]
    sortFiles(items, 'name', 'asc')
    expect(items).toEqual(copy)
  })
})
