import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const ROOT = '00000000-0000-0000-0000-000000000000'

vi.mock('@/services/apiClient', () => ({
  ROOT_UID: '00000000-0000-0000-0000-000000000000',
  errorMessage: (e: unknown) => String(e),
  default: {},
}))

vi.mock('@/services/fileService', () => ({
  fileService: {
    listDirectory: vi.fn(),
    makeDirectory: vi.fn(),
    removeDirectory: vi.fn(),
    removeFile: vi.fn(),
    rename: vi.fn(),
    downloadFile: vi.fn(),
  },
}))

import { useFileStore } from '@/stores/files'
import { fileService } from '@/services/fileService'

const dir = { uid: 'd1', name: 'docs', type: 'directory' as const, size: 0, isDirectory: true, renditionCount: 0, hasRenditions: false }
const file = { uid: 'f1', name: 'a.txt', type: 'file' as const, size: 3, isDirectory: false, renditionCount: 0, hasRenditions: false }

describe('files store (UID-native)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    ;(fileService.listDirectory as any).mockResolvedValue([dir, file])
  })

  it('openRoot loads the root and resets breadcrumbs', async () => {
    const store = useFileStore()
    await store.openRoot()
    expect(fileService.listDirectory).toHaveBeenCalledWith(ROOT)
    expect(store.currentUid).toBe(ROOT)
    expect(store.breadcrumbs).toEqual([{ uid: ROOT, name: 'Home' }])
    expect(store.items).toHaveLength(2)
  })

  it('openDirectory descends and pushes a breadcrumb', async () => {
    const store = useFileStore()
    await store.openRoot()
    await store.openDirectory(dir)
    expect(store.currentUid).toBe('d1')
    expect(store.breadcrumbs.map((c) => c.name)).toEqual(['Home', 'docs'])
  })

  it('navigateToCrumb truncates the trail', async () => {
    const store = useFileStore()
    await store.openRoot()
    await store.openDirectory(dir)
    await store.navigateToCrumb(0)
    expect(store.currentUid).toBe(ROOT)
    expect(store.breadcrumbs).toHaveLength(1)
  })

  it('deleteItem dispatches to the right service by type', async () => {
    const store = useFileStore()
    await store.openRoot()
    await store.deleteItem(file)
    expect(fileService.removeFile).toHaveBeenCalledWith('f1')
    await store.deleteItem(dir)
    expect(fileService.removeDirectory).toHaveBeenCalledWith('d1')
  })

  it('renameItem skips no-op renames', async () => {
    const store = useFileStore()
    await store.openRoot()
    await store.renameItem(file, 'a.txt')
    expect(fileService.rename).not.toHaveBeenCalled()
    await store.renameItem(file, 'b.txt')
    expect(fileService.rename).toHaveBeenCalledWith('f1', 'b.txt')
  })
})
