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
    undeleteFile: vi.fn(),
    rename: vi.fn(),
    move: vi.fn(),
    copy: vi.fn(),
    downloadFile: vi.fn(),
    stat: vi.fn(),
    checkPermission: vi.fn(),
  },
}))

import { useFileStore } from '@/stores/files'
import { fileService } from '@/services/fileService'

const dir = { uid: 'd1', name: 'docs', type: 'directory' as const, size: 0, isDirectory: true, renditionCount: 0, hasRenditions: false, deleted: false, createdAt: 0, modifiedAt: 0, owner: '', createdBy: '', modifiedBy: '' }
const file = { uid: 'f1', name: 'a.txt', type: 'file' as const, size: 3, isDirectory: false, renditionCount: 0, hasRenditions: false, deleted: false, createdAt: 0, modifiedAt: 0, owner: '', createdBy: '', modifiedBy: '' }

describe('files store (UID-native)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    ;(fileService.listDirectory as any).mockResolvedValue([dir, file])
    ;(fileService.checkPermission as any).mockResolvedValue(false) // no deleted perms by default
  })

  it('openRoot loads the root and resets breadcrumbs', async () => {
    const store = useFileStore()
    await store.openRoot()
    expect(fileService.listDirectory).toHaveBeenCalledWith(ROOT, { deleted: false })
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
    expect(fileService.listDirectory).toHaveBeenCalledWith('d1', { deleted: false })
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

  it('canPasteHere blocks pasting a folder into itself or a descendant', async () => {
    const store = useFileStore()
    await store.openRoot()
    await store.openDirectory(dir) // currentUid = d1; breadcrumbs include d1
    store.setClipboard('cut', [dir]) // the folder being pasted IS the current dir
    expect(store.canPasteHere).toBe(false)
    await store.paste() // guarded → no-op
    expect(fileService.move).not.toHaveBeenCalled()
    store.setClipboard('copy', [file]) // a file is always pasteable here
    expect(store.canPasteHere).toBe(true)
  })

  // --- soft-deleted view + undelete ---
  it('exposes LIST_DELETED / UNDELETE / WRITE permissions after a load', async () => {
    ;(fileService.checkPermission as any).mockResolvedValue(true)
    const store = useFileStore()
    await store.openRoot()
    expect(store.canListDeleted).toBe(true)
    expect(store.canUndelete).toBe(true)
    expect(store.canWrite).toBe(true)
    expect(fileService.checkPermission).toHaveBeenCalledWith(ROOT, { permission: 'LIST_DELETED' })
    expect(fileService.checkPermission).toHaveBeenCalledWith(ROOT, { permission: 'UNDELETE' })
    expect(fileService.checkPermission).toHaveBeenCalledWith(ROOT, { permission: 'w' })
  })

  it('canWrite is false when WRITE is denied on the folder', async () => {
    ;(fileService.checkPermission as any).mockImplementation(
      (_uid: string, o: { permission: string }) => Promise.resolve(o.permission !== 'w'),
    )
    const store = useFileStore()
    await store.openRoot()
    expect(store.canWrite).toBe(false) // gates New folder / Upload / rename / cut / delete
  })

  it('toggleShowDeleted requests the with-deleted listing and marks deleted items', async () => {
    ;(fileService.checkPermission as any).mockResolvedValue(true)
    const gone = { ...file, uid: 'g1', name: 'gone.txt', deleted: true }
    ;(fileService.listDirectory as any).mockResolvedValue([dir, file, gone])
    const store = useFileStore()
    await store.openRoot()
    await store.toggleShowDeleted()
    expect(store.showDeleted).toBe(true)
    expect(fileService.listDirectory).toHaveBeenLastCalledWith(ROOT, { deleted: true })
    expect(store.items.find((i) => i.uid === 'g1')?.deleted).toBe(true)
  })

  it('drops the deleted view when entering a dir without LIST_DELETED', async () => {
    ;(fileService.checkPermission as any).mockResolvedValue(true)
    const store = useFileStore()
    await store.openRoot()
    await store.toggleShowDeleted()
    expect(store.showDeleted).toBe(true)
    ;(fileService.checkPermission as any).mockResolvedValue(false) // next dir: no perm
    await store.openDirectory(dir)
    expect(store.showDeleted).toBe(false)
    expect(fileService.listDirectory).toHaveBeenLastCalledWith('d1', { deleted: false })
  })

  it('undeleteItem restores the file then reloads', async () => {
    const store = useFileStore()
    await store.openRoot()
    await store.undeleteItem(file)
    expect(fileService.undeleteFile).toHaveBeenCalledWith('f1')
    // reload ran after the restore (initial openRoot + this one)
    expect((fileService.listDirectory as any).mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
