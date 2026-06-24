import { describe, it, expect, vi, beforeEach } from 'vitest'

const { listRenditions, downloadFile } = vi.hoisted(() => ({
  listRenditions: vi.fn(),
  downloadFile: vi.fn(),
}))

vi.mock('@/services/fileService', () => ({
  fileService: { listRenditions, downloadFile },
}))

import {
  parseRenditionName,
  toRenditionSet,
  loadRenditionSet,
  renditionObjectUrl,
  revokeRenditionUrl,
} from '@/services/renditions'

describe('renditions: name parsing', () => {
  it('parses "<version>-<fmt>.<ext>" with a dotted/underscored version', () => {
    expect(parseRenditionName('20260624_192155.488-thumbnail.png')).toEqual({
      version: '20260624_192155.488',
      fmt: 'thumbnail',
      ext: 'png',
    })
    expect(parseRenditionName('v9-preview.png')).toEqual({ version: 'v9', fmt: 'preview', ext: 'png' })
    expect(parseRenditionName('v9-pdf.pdf')).toEqual({ version: 'v9', fmt: 'pdf', ext: 'pdf' })
    expect(parseRenditionName('v9-poster.png')).toEqual({ version: 'v9', fmt: 'poster', ext: 'png' })
  })

  it('returns null for non-rendition names', () => {
    expect(parseRenditionName('report.pdf')).toBeNull() // no "-<fmt>"
    expect(parseRenditionName('v1-unknownfmt.png')).toBeNull() // fmt not in vocabulary
    expect(parseRenditionName('x-thumbnail')).toBeNull() // no extension
    expect(parseRenditionName('')).toBeNull()
  })
})

describe('renditions: set reduction', () => {
  it('keeps one entry per fmt, latest source version winning', () => {
    const set = toRenditionSet([
      { uid: 'a', name: 'v1-thumbnail.png' },
      { uid: 'b', name: 'v2-thumbnail.png' }, // newer version supersedes v1
      { uid: 'c', name: 'v2-preview.png' },
      { uid: 'd', name: 'v2-pdf.pdf' },
      { uid: 'e', name: 'notes.txt' }, // ignored
    ])
    expect(set.thumbnail?.uid).toBe('b')
    expect(set.preview?.uid).toBe('c')
    expect(set.pdf?.uid).toBe('d')
    expect(set.poster).toBeUndefined()
  })

  it('loadRenditionSet fetches children then reduces', async () => {
    listRenditions.mockResolvedValue([
      { uid: 'r1', name: 'v1-preview.png' },
      { uid: 'r2', name: 'v1-pdf.pdf' },
    ])
    const set = await loadRenditionSet('file1')
    expect(listRenditions).toHaveBeenCalledWith('file1')
    expect(set.preview?.uid).toBe('r1')
    expect(set.pdf?.uid).toBe('r2')
  })
})

describe('renditions: object URLs', () => {
  beforeEach(() => {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake-url')
    globalThis.URL.revokeObjectURL = vi.fn()
  })

  it('downloads bytes and wraps them in an object URL', async () => {
    const blob = new Blob(['x'])
    downloadFile.mockResolvedValue(blob)
    const url = await renditionObjectUrl('r1')
    expect(downloadFile).toHaveBeenCalledWith('r1')
    expect(globalThis.URL.createObjectURL).toHaveBeenCalledWith(blob)
    expect(url).toBe('blob:fake-url')
  })

  it('revokes only blob URLs', () => {
    revokeRenditionUrl('blob:fake-url')
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url')
    revokeRenditionUrl('https://not-a-blob')
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })
})
