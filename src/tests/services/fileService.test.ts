import { describe, it, expect, beforeEach, vi } from 'vitest'

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}))

vi.mock('@/services/apiClient', () => ({
  default: { get, post, put, delete: del },
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
          { uid: 'f1', name: 'a.txt', type: 'file', size: 12, version_count: 1, rendition_count: 2, has_renditions: true },
        ],
      },
    })
    const items = await fileService.listDirectory('root')
    expect(get).toHaveBeenCalledWith('/v1/dirs/root')
    expect(items).toEqual([
      { uid: 'd1', name: 'docs', type: 'directory', size: 0, isDirectory: true, renditionCount: 0, hasRenditions: false },
      { uid: 'f1', name: 'a.txt', type: 'file', size: 12, isDirectory: false, renditionCount: 2, hasRenditions: true },
    ])
  })

  it('lists a file\'s renditions on demand', async () => {
    get.mockResolvedValue({
      data: { entries: [{ uid: 'r1', name: '20260101-pdf.pdf', type: 'file', size: 50, version_count: 1 }] },
    })
    const items = await fileService.listRenditions('f1')
    expect(get).toHaveBeenCalledWith('/v1/files/f1/renditions')
    expect(items).toEqual([
      { uid: 'r1', name: '20260101-pdf.pdf', type: 'file', size: 50, isDirectory: false, renditionCount: 0, hasRenditions: false },
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

  it('moves and copies via /nodes/{uid}/move|copy with destination_parent_uid', async () => {
    post.mockResolvedValue({ data: {} })
    await fileService.move('f1', 'd2')
    expect(post).toHaveBeenCalledWith('/v1/nodes/f1/move', { destination_parent_uid: 'd2' })
    await fileService.copy('f1', 'd2')
    expect(post).toHaveBeenCalledWith('/v1/nodes/f1/copy', { destination_parent_uid: 'd2' })
  })

  it('findChildByName matches a non-directory child by name (else null)', async () => {
    get.mockResolvedValue({ data: { entries: [
      { uid: 'd1', name: 'docs', type: 'directory' },
      { uid: 'f1', name: 'a.txt', type: 'file' },
    ] } })
    expect(await fileService.findChildByName('p', 'a.txt')).toBe('f1')
    expect(await fileService.findChildByName('p', 'docs')).toBeNull() // a directory, not a file
    expect(await fileService.findChildByName('p', 'missing')).toBeNull()
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

  it('handles versions: list / get / restore / purge', async () => {
    get.mockResolvedValueOnce({ data: { versions: ['v1', 'v2'] } })
    expect(await fileService.listVersions('f1')).toEqual(['v1', 'v2'])
    expect(get).toHaveBeenCalledWith('/v1/files/f1/versions')

    const blob = new Blob(['v'])
    get.mockResolvedValueOnce({ data: blob })
    expect(await fileService.getVersion('f1', 'v2')).toBe(blob)
    expect(get).toHaveBeenLastCalledWith('/v1/files/f1/versions/v2', { responseType: 'blob' })

    post.mockResolvedValueOnce({ data: { restored_version: 'v3' } })
    expect(await fileService.restoreVersion('f1', 'v2')).toBe('v3')
    expect(post).toHaveBeenCalledWith('/v1/files/f1/restore', { version_timestamp: 'v2' })

    post.mockResolvedValueOnce({ data: {} })
    await fileService.purgeVersions('f1', 3)
    expect(post).toHaveBeenLastCalledWith('/v1/files/f1/purge', { keep_count: 3 })
  })

  it('reads and writes metadata', async () => {
    get.mockResolvedValue({ data: { metadata: { color: 'blue' } } })
    expect(await fileService.getMetadata('f1')).toEqual({ color: 'blue' })
    expect(get).toHaveBeenCalledWith('/v1/nodes/f1/metadata')

    put.mockResolvedValue({ data: {} })
    await fileService.setMetadata('f1', 'color', 'red')
    expect(put).toHaveBeenCalledWith('/v1/nodes/f1/metadata/color', { value: 'red' })

    del.mockResolvedValue({ data: {} })
    await fileService.deleteMetadata('f1', 'color')
    expect(del).toHaveBeenCalledWith('/v1/nodes/f1/metadata/color')
  })

  it('checks a permission via query params', async () => {
    get.mockResolvedValue({ data: { has_permission: true } })
    const ok = await fileService.checkPermission('f1', { permission: 'r' })
    expect(ok).toBe(true)
    expect(get).toHaveBeenCalledWith('/v1/nodes/f1/permissions', { params: { permission: 'r' } })
  })

  it('grants and revokes permissions', async () => {
    post.mockResolvedValue({ data: {} })
    await fileService.grantPermission('f1', { principal: 'dave', permission: 'r', effect: 'allow' })
    expect(post).toHaveBeenCalledWith('/v1/nodes/f1/permissions', {
      principal: 'dave',
      permission: 'r',
      effect: 'allow',
    })

    del.mockResolvedValue({ data: {} })
    await fileService.revokePermission('f1', { principal: 'dave', permission: 'r' })
    expect(del).toHaveBeenCalledWith('/v1/nodes/f1/permissions', {
      data: { principal: 'dave', permission: 'r' },
    })
  })
})
