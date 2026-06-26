import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const ROOT = '00000000-0000-0000-0000-000000000000'

vi.mock('@/services/apiClient', () => ({
  ROOT_UID: '00000000-0000-0000-0000-000000000000',
  errorMessage: (e: unknown) => String(e),
  errorStatus: (e: any) => e?.status,
  default: {},
}))

vi.mock('@/services/fileService', () => ({
  fileService: {
    listDirectory: vi.fn(),
    makeDirectory: vi.fn(),
    removeDirectory: vi.fn(),
    removeFile: vi.fn(),
    rename: vi.fn(),
    move: vi.fn(),
    copy: vi.fn(),
    downloadFile: vi.fn(),
    stat: vi.fn(),
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

  it('revealFile navigates to the file’s folder, rebuilds breadcrumbs, selects it, opens the drawer', async () => {
    const store = useFileStore()
    ;(fileService.stat as any).mockImplementation((uid: string) => {
      if (uid === 'f1') return Promise.resolve({ uid: 'f1', name: 'a.txt', type: 'file', parent_uid: 'd1' })
      if (uid === 'd1') return Promise.resolve({ uid: 'd1', name: 'docs', type: 'directory', parent_uid: ROOT })
      return Promise.reject(new Error('unknown uid'))
    })
    ;(fileService.listDirectory as any).mockResolvedValue([file]) // listing of folder d1

    await store.revealFile('f1')

    expect(store.currentUid).toBe('d1')
    expect(store.breadcrumbs.map((c) => c.name)).toEqual(['Home', 'docs'])
    expect(fileService.listDirectory).toHaveBeenCalledWith('d1')
    expect(store.drawerOpen).toBe(true)
    expect(store.detailItem?.uid).toBe('f1')
  })

  it('revealFile opens a folder UID directly (into the folder, no drawer)', async () => {
    const store = useFileStore()
    ;(fileService.stat as any).mockResolvedValue({ uid: 'd1', name: 'docs', type: 'directory', parent_uid: ROOT })
    ;(fileService.listDirectory as any).mockResolvedValue([file])

    await store.revealFile('d1')

    expect(store.currentUid).toBe('d1')
    expect(store.breadcrumbs.map((c) => c.name)).toEqual(['Home', 'docs'])
    expect(store.drawerOpen).toBe(false)
  })

  it('revealFile reports {ok:false, status} on failure (e.g. 403 forbidden)', async () => {
    const store = useFileStore()
    ;(fileService.stat as any).mockRejectedValue({ status: 403 })
    const res = await store.revealFile('f1')
    expect(res).toEqual({ ok: false, status: 403 })
  })

  // --- clipboard (cut/copy/paste) ---
  it('copy → paste calls copy() into the current dir and empties the clipboard', async () => {
    const store = useFileStore()
    await store.openRoot()
    await store.openDirectory(dir) // currentUid = d1
    store.setClipboard('copy', [file])
    expect(store.clipboard).toEqual({ mode: 'copy', items: [file] })
    await store.paste()
    expect(fileService.copy).toHaveBeenCalledWith('f1', 'd1')
    expect(fileService.move).not.toHaveBeenCalled()
    expect(store.clipboard).toBeNull() // emptied after a clean paste
  })

  it('cut → paste calls move() and empties the clipboard', async () => {
    const store = useFileStore()
    await store.openRoot()
    ;(fileService.listDirectory as any).mockResolvedValue([]) // destination d1 is empty
    await store.openDirectory(dir)
    store.setClipboard('cut', [file])
    await store.paste()
    expect(fileService.move).toHaveBeenCalledWith('f1', 'd1')
    expect(store.clipboard).toBeNull()
  })

  it('paste skips a cut item already in the destination folder (no-op move)', async () => {
    const store = useFileStore()
    await store.openRoot() // currentUid = ROOT, items = [dir, file]
    store.setClipboard('cut', [file])
    await store.paste() // pasting into the same folder the item is in
    expect(fileService.move).not.toHaveBeenCalled()
    expect(store.clipboard).toBeNull()
  })

  it('paste keeps the clipboard and surfaces an error when a move fails (e.g. 403)', async () => {
    const store = useFileStore()
    await store.openRoot()
    ;(fileService.listDirectory as any).mockResolvedValue([]) // destination d1 is empty
    await store.openDirectory(dir)
    ;(fileService.move as any).mockRejectedValueOnce({ status: 403 })
    store.setClipboard('cut', [file])
    await store.paste()
    expect(store.clipboard).not.toBeNull() // not emptied on failure
    expect(store.error).toBeTruthy()
  })

  // --- selection (batch operations) ---
  it('toggleSelect / toggleSelectAll drive the selection getters', async () => {
    const store = useFileStore()
    await store.openRoot() // items = [dir, file]
    store.toggleSelect('f1')
    expect(store.selected.has('f1')).toBe(true)
    expect(store.someSelected).toBe(true)
    expect(store.allSelected).toBe(false)
    store.toggleSelectAll() // selects all
    expect(store.allSelected).toBe(true)
    expect(store.selectedItems.map((i) => i.uid)).toEqual(['d1', 'f1'])
    store.toggleSelectAll() // clears
    expect(store.selected.size).toBe(0)
  })

  it('selection is cleared when the directory reloads', async () => {
    const store = useFileStore()
    await store.openRoot()
    store.toggleSelect('f1')
    await store.openDirectory(dir) // navigates → load() clears selection
    expect(store.selected.size).toBe(0)
  })

  it('deleteSelected removes each selected item by type', async () => {
    const store = useFileStore()
    await store.openRoot()
    store.toggleSelect('f1')
    store.toggleSelect('d1')
    await store.deleteSelected()
    expect(fileService.removeFile).toHaveBeenCalledWith('f1')
    expect(fileService.removeDirectory).toHaveBeenCalledWith('d1')
  })
})
