import { describe, it, expect } from 'vitest'
import { sortFiles } from '@/utils/sortFiles'
import type { FileItem } from '@/stores/files'

const f = (name: string, size: number, isDirectory = false): FileItem =>
  ({ uid: name, name, size, isDirectory, renditionCount: 0, hasRenditions: false }) as FileItem

// A file with explicit provenance for created/modified sort cases.
const p = (
  name: string,
  over: Partial<Pick<FileItem, 'createdAt' | 'modifiedAt' | 'createdBy' | 'modifiedBy'>>,
): FileItem =>
  ({
    uid: name,
    name,
    size: 0,
    isDirectory: false,
    renditionCount: 0,
    hasRenditions: false,
    createdAt: 0,
    modifiedAt: 0,
    createdBy: '',
    modifiedBy: '',
    ...over,
  }) as FileItem

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

  it('sorts by created time (numeric), both directions', () => {
    const items = [
      p('old.txt', { createdAt: 100 }),
      p('new.txt', { createdAt: 300 }),
      p('mid.txt', { createdAt: 200 }),
    ]
    expect(names(sortFiles(items, 'created', 'asc'))).toEqual(['old.txt', 'mid.txt', 'new.txt'])
    expect(names(sortFiles(items, 'created', 'desc'))).toEqual(['new.txt', 'mid.txt', 'old.txt'])
  })

  it('sorts by modified time (numeric), both directions', () => {
    const items = [
      p('a.txt', { modifiedAt: 50 }),
      p('b.txt', { modifiedAt: 90 }),
      p('c.txt', { modifiedAt: 70 }),
    ]
    expect(names(sortFiles(items, 'modified', 'asc'))).toEqual(['a.txt', 'c.txt', 'b.txt'])
    expect(names(sortFiles(items, 'modified', 'desc'))).toEqual(['b.txt', 'c.txt', 'a.txt'])
  })

  it('sorts by createdBy (string, case-insensitive), both directions', () => {
    const items = [
      p('x.txt', { createdBy: 'charlie' }),
      p('y.txt', { createdBy: 'Alice' }),
      p('z.txt', { createdBy: 'bob' }),
    ]
    expect(names(sortFiles(items, 'createdBy', 'asc'))).toEqual(['y.txt', 'z.txt', 'x.txt'])
    expect(names(sortFiles(items, 'createdBy', 'desc'))).toEqual(['x.txt', 'z.txt', 'y.txt'])
  })

  it('sorts by modifiedBy (string, case-insensitive), both directions', () => {
    const items = [
      p('x.txt', { modifiedBy: 'zoe' }),
      p('y.txt', { modifiedBy: 'Ann' }),
      p('z.txt', { modifiedBy: 'mike' }),
    ]
    expect(names(sortFiles(items, 'modifiedBy', 'asc'))).toEqual(['y.txt', 'z.txt', 'x.txt'])
    expect(names(sortFiles(items, 'modifiedBy', 'desc'))).toEqual(['x.txt', 'z.txt', 'y.txt'])
  })

  it('keeps folders first when sorting by provenance columns', () => {
    const items = [
      p('file.txt', { createdAt: 100 }),
      { ...p('Docs', { createdAt: 999 }), isDirectory: true },
    ]
    expect(names(sortFiles(items, 'created', 'asc'))).toEqual(['Docs', 'file.txt'])
    expect(names(sortFiles(items, 'created', 'desc'))).toEqual(['Docs', 'file.txt'])
  })

  it('does not mutate the input array', () => {
    const items = [f('b', 1), f('a', 1)]
    const copy = [...items]
    sortFiles(items, 'name', 'asc')
    expect(items).toEqual(copy)
  })
})
