import { defineStore } from 'pinia'
import { fileService, type FileItem } from '@/services/fileService'
import { ROOT_UID } from '@/services/apiClient'
import { errorMessage, errorStatus } from '@/services/apiClient'

export type { FileItem }

interface Crumb {
  uid: string
  name: string
}

interface FilesState {
  currentUid: string
  items: FileItem[]
  breadcrumbs: Crumb[]
  detailItem: FileItem | null
  drawerOpen: boolean
  loading: boolean
  error: string | null
  viewMode: 'list' | 'grid'
  // Hidden renditions of a file, fetched on demand.
  renditionsFor: FileItem | null
  renditions: FileItem[]
  renditionsOpen: boolean
  renditionsLoading: boolean
  // Cut/copy clipboard, pasted into the current directory. Persists across
  // navigation so you can cut here and paste in another folder.
  clipboard: { mode: 'cut' | 'copy'; items: FileItem[] } | null
  // Checkbox selection (uids) for batch operations, scoped to the current dir.
  selected: Set<string>
}

const ROOT_CRUMB: Crumb = { uid: ROOT_UID, name: 'Home' }

export const useFileStore = defineStore('files', {
  state: (): FilesState => ({
    currentUid: ROOT_UID,
    items: [],
    breadcrumbs: [ROOT_CRUMB],
    detailItem: null,
    drawerOpen: false,
    loading: false,
    error: null,
    viewMode: 'grid',
    renditionsFor: null,
    renditions: [],
    renditionsOpen: false,
    renditionsLoading: false,
    clipboard: null,
    selected: new Set<string>(),
  }),

  getters: {
    // The selected items in the current listing.
    selectedItems: (state): FileItem[] => state.items.filter((i) => state.selected.has(i.uid)),
    allSelected: (state): boolean =>
      state.items.length > 0 && state.selected.size === state.items.length,
    someSelected: (state): boolean =>
      state.selected.size > 0 && state.selected.size < state.items.length,
  },

  actions: {
    async load() {
      this.loading = true
      this.error = null
      this.drawerOpen = false
      this.detailItem = null
      this.renditionsOpen = false
      this.renditionsFor = null
      this.selected.clear() // selection is per-directory
      try {
        this.items = await fileService.listDirectory(this.currentUid)
      } catch (e) {
        this.error = errorMessage(e, 'Failed to load directory')
        this.items = []
      } finally {
        this.loading = false
      }
    },

    openDetails(item: FileItem) {
      this.detailItem = item
      this.drawerOpen = true
    },

    closeDetails() {
      this.drawerOpen = false
      this.detailItem = null
    },

    // Fetch and show a file's hidden renditions (alternate formats).
    async openRenditions(item: FileItem) {
      this.renditionsFor = item
      this.renditionsOpen = true
      this.renditionsLoading = true
      this.renditions = []
      try {
        this.renditions = await fileService.listRenditions(item.uid)
      } catch (e) {
        this.error = errorMessage(e, 'Failed to load renditions')
      } finally {
        this.renditionsLoading = false
      }
    },

    closeRenditions() {
      this.renditionsOpen = false
      this.renditionsFor = null
      this.renditions = []
    },

    // Open the root and reset breadcrumbs.
    async openRoot() {
      this.currentUid = ROOT_UID
      this.breadcrumbs = [ROOT_CRUMB]
      await this.load()
    },

    // Descend into a child directory.
    async openDirectory(item: FileItem) {
      if (!item.isDirectory) return
      this.currentUid = item.uid
      this.breadcrumbs.push({ uid: item.uid, name: item.name })
      await this.load()
    },

    // Deep-link: reveal a node by UID. Rebuilds the breadcrumb trail by walking
    // parents, navigates to the containing folder (or into the folder itself if
    // the UID is a directory), and for a file selects it + opens the drawer.
    // Returns { ok, status } so callers can react to e.g. a 403 (no access).
    async revealFile(uid: string): Promise<{ ok: boolean; status?: number }> {
      if (!uid) {
        await this.openRoot()
        return { ok: true }
      }
      try {
        const info = await fileService.stat(uid)
        const isDir = (info.type || '').toLowerCase() === 'directory'
        const folderUid = isDir ? uid : info.parent_uid || ROOT_UID

        // Walk from the folder up to root to rebuild the breadcrumb trail.
        const trail: Crumb[] = []
        let cur = folderUid
        for (let i = 0; cur && cur !== ROOT_UID && i < 64; i++) {
          const p = await fileService.stat(cur)
          trail.unshift({ uid: cur, name: p.name })
          cur = p.parent_uid || ROOT_UID
        }
        this.breadcrumbs = [ROOT_CRUMB, ...trail]
        this.currentUid = folderUid
        await this.load()

        if (!isDir) {
          const item = this.items.find((it) => it.uid === uid)
          if (item) this.openDetails(item)
        }
        return { ok: true }
      } catch (e) {
        this.error = errorMessage(e, 'Failed to open file location')
        return { ok: false, status: errorStatus(e) }
      }
    },

    // Jump to a breadcrumb (truncates the trail after it).
    async navigateToCrumb(index: number) {
      const crumb = this.breadcrumbs[index]
      if (!crumb) return
      this.breadcrumbs = this.breadcrumbs.slice(0, index + 1)
      this.currentUid = crumb.uid
      await this.load()
    },

    async createDirectory(name: string) {
      const trimmed = name.trim()
      if (!trimmed) return
      try {
        await fileService.makeDirectory(this.currentUid, trimmed)
        await this.load()
      } catch (e) {
        this.error = errorMessage(e, 'Failed to create folder')
      }
    },

    async deleteItem(item: FileItem) {
      try {
        if (item.isDirectory) await fileService.removeDirectory(item.uid)
        else await fileService.removeFile(item.uid)
        await this.load()
      } catch (e) {
        this.error = errorMessage(e, 'Failed to delete')
      }
    },

    async renameItem(item: FileItem, newName: string) {
      const trimmed = newName.trim()
      if (!trimmed || trimmed === item.name) return
      try {
        await fileService.rename(item.uid, trimmed)
        await this.load()
      } catch (e) {
        this.error = errorMessage(e, 'Failed to rename')
      }
    },

    // --- selection (batch operations) ---
    toggleSelect(uid: string) {
      if (this.selected.has(uid)) this.selected.delete(uid)
      else this.selected.add(uid)
    },

    // Select all if not all selected, else clear (header checkbox).
    toggleSelectAll() {
      if (this.allSelected) this.selected.clear()
      else this.selected = new Set(this.items.map((i) => i.uid))
    },

    clearSelection() {
      this.selected.clear()
    },

    // Delete the selected items (best-effort; surfaces the last error).
    async deleteSelected() {
      const targets = this.selectedItems
      let lastError: string | null = null
      for (const it of targets) {
        try {
          if (it.isDirectory) await fileService.removeDirectory(it.uid)
          else await fileService.removeFile(it.uid)
        } catch (e) {
          lastError = errorMessage(e, 'Failed to delete some items')
        }
      }
      await this.load() // clears selection + error, then re-surface any error
      if (lastError) this.error = lastError
    },

    // Stage items for a move (cut) or copy; paste() applies them in the current
    // directory. The backend enforces the real ACL (delete-on-source for a move,
    // read-on-source, and write-on-destination); a denied op surfaces as an error.
    setClipboard(mode: 'cut' | 'copy', items: FileItem[]) {
      this.clipboard = { mode, items: [...items] }
    },

    clearClipboard() {
      this.clipboard = null
    },

    async paste() {
      if (!this.clipboard) return
      const { mode, items } = this.clipboard
      const dest = this.currentUid
      const here = new Set(this.items.map((i) => i.uid)) // already in this folder
      let failed = 0
      let lastError: string | null = null
      for (const it of items) {
        if (mode === 'cut' && here.has(it.uid)) continue // no-op: already here
        try {
          if (mode === 'cut') await fileService.move(it.uid, dest)
          else await fileService.copy(it.uid, dest)
        } catch (e) {
          failed++
          lastError = errorMessage(e, mode === 'cut' ? 'Failed to move' : 'Failed to copy')
        }
      }
      if (failed === 0) this.clipboard = null // empty the clipboard after a clean paste
      await this.load() // refresh (also clears error), so set any error after
      if (lastError) this.error = lastError
    },

    async downloadItem(item: FileItem) {
      try {
        const blob = await fileService.downloadFile(item.uid)
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = item.name
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      } catch (e) {
        this.error = errorMessage(e, 'Failed to download')
      }
    },
  },
})
