import { describe, it, expect, beforeEach, vi } from 'vitest'

const { get, post, del } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn() }))

vi.mock('@/services/apiClient', () => ({
  default: { get, post, delete: del },
  ROOT_UID: '00000000-0000-0000-0000-000000000000',
  errorMessage: (e: unknown) => String(e),
}))

import { fileService } from '@/services/fileService'

describe('fileService (REST)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists a directory and maps entries to FileItem', async () => {
    get.mockResolvedValue({
      data: {
        entries: [
          { uid: 'd1', name: 'docs', type: 'directory', size: 0, version_count: 0 },
          { uid: 'f1', name: 'a.txt', type: 'file', size: 12, version_count: 1 },
        ],
      },
    })
    const items = await fileService.listDirectory('root')
    expect(get).toHaveBeenCalledWith('/v1/dirs/root')
    expect(items).toEqual([
      { uid: 'd1', name: 'docs', type: 'directory', size: 0, isDirectory: true },
      { uid: 'f1', name: 'a.txt', type: 'file', size: 12, isDirectory: false },
    ])
  })

  it('creates a directory and returns the new uid', async () => {
    post.mockResolvedValue({ data: { uid: 'new' } })
    const uid = await fileService.makeDirectory('parent', 'sub')
    expect(post).toHaveBeenCalledWith('/v1/dirs/parent', { name: 'sub' })
    expect(uid).toBe('new')
  })

  it('renames via /nodes/{uid}/rename', async () => {
    post.mockResolvedValue({ data: {} })
    await fileService.rename('f1', 'b.txt')
    expect(post).toHaveBeenCalledWith('/v1/nodes/f1/rename', { new_name: 'b.txt' })
  })

  it('deletes files and directories on the right routes', async () => {
    del.mockResolvedValue({ data: {} })
    await fileService.removeFile('f1')
    await fileService.removeDirectory('d1')
    expect(del).toHaveBeenCalledWith('/v1/files/f1')
    expect(del).toHaveBeenCalledWith('/v1/dirs/d1')
  })

  it('downloads content as a blob', async () => {
    const blob = new Blob(['hi'])
    get.mockResolvedValue({ data: blob })
    const out = await fileService.downloadFile('f1')
    expect(get).toHaveBeenCalledWith('/v1/files/f1/content', { responseType: 'blob' })
    expect(out).toBe(blob)
  })
})
