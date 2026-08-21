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

import { defineStore } from 'pinia'
import { fileService, type FileItem } from '@/services/fileService'
import { ROOT_UID } from '@/services/apiClient'
import { errorMessage, errorStatus } from '@/services/apiClient'

export type { FileItem }

// A compact fingerprint of a listing, used by the background poll to tell whether
// anything the UI cares about actually changed before swapping the list. Covers
// membership (uid), rename (name), new version (size/modifiedAt), soft-delete, and
// renditions appearing. Order-independent so a re-sort alone doesn't force a churn.
function listingSignature(items: FileItem[]): string {
  return items
    .map((i) => `${i.uid}:${i.name}:${i.size}:${i.modifiedAt}:${i.deleted ? 1 : 0}:${i.renditionCount}`)
    .sort()
    .join('|')
}

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
  // Show soft-deleted items (requires LIST_DELETED on the current dir). Per-dir
  // permissions gate the toggle and the Undelete action in the UI.
  showDeleted: boolean
  canListDeleted: boolean
  canUndelete: boolean
  // WRITE permission on the current dir — gates New folder / Upload / paste, so a
  // user who has write here (e.g. their own home folder) can modify it regardless
  // of their global role level.
  canWrite: boolean
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
    showDeleted: false,
    canListDeleted: false,
    canUndelete: false,
    canWrite: false,
  }),

  getters: {
    // The selected items in the current listing.
    selectedItems: (state): FileItem[] => state.items.filter((i) => state.selected.has(i.uid)),
    allSelected: (state): boolean =>
      state.items.length > 0 && state.selected.size === state.items.length,
    someSelected: (state): boolean =>
      state.selected.size > 0 && state.selected.size < state.items.length,

    // Whether the clipboard can be pasted into the current directory. Invalid to
    // move/copy a folder into itself or one of its descendants — the current dir
    // is inside that folder's subtree exactly when the folder's uid appears in
    // the breadcrumb trail (root → … → currentUid).
    canPasteHere(state): boolean {
      if (!state.clipboard) return false
      const trail = new Set(state.breadcrumbs.map((c) => c.uid))
      return !state.clipboard.items.some((it) => it.isDirectory && trail.has(it.uid))
    },
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
        // Per-dir permissions for the deleted-items UI (best-effort; a denied or
        // failing check just hides the affordances). Parallel with each other.
        const [ld, ud, wr] = await Promise.all([
          fileService.checkPermission(this.currentUid, { permission: 'LIST_DELETED' }).catch(() => false),
          fileService.checkPermission(this.currentUid, { permission: 'UNDELETE' }).catch(() => false),
          fileService.checkPermission(this.currentUid, { permission: 'w' }).catch(() => false),
        ])
        this.canListDeleted = ld
        this.canUndelete = ud
        this.canWrite = wr
        // Entering a dir we can't list-deleted in silently drops back to the live view.
        if (this.showDeleted && !ld) this.showDeleted = false
        this.items = await fileService.listDirectory(this.currentUid, { deleted: this.showDeleted })
      } catch (e) {
        this.error = errorMessage(e, 'Failed to load directory')
        this.items = []
      } finally {
        this.loading = false
      }
    },

    // Silent re-fetch of the current directory — no spinner, no selection reset,
    // no drawer changes. Backs the periodic background poll (and post-mutation
    // refreshes) so out-of-band changes (an action moving a file in/out, another
    // user's upload, a new version) appear without a disruptive full load().
    // Best-effort: a transient failure keeps the current listing rather than
    // blanking it, and items are only swapped when the listing actually changed
    // so we don't churn the DOM or drop scroll position every tick.
    async refresh() {
      if (this.loading) return // a full load() is already in flight
      let items: FileItem[]
      try {
        items = await fileService.listDirectory(this.currentUid, { deleted: this.showDeleted })
      } catch {
        return // transient — leave the current listing intact
      }
      if (listingSignature(items) === listingSignature(this.items)) return
      this.items = items
      // Prune selection of any uids that no longer exist in the listing.
      if (this.selected.size) {
        const present = new Set(items.map((i) => i.uid))
        for (const uid of [...this.selected]) if (!present.has(uid)) this.selected.delete(uid)
      }
      // If the open details drawer is for an item that vanished, close it.
      if (this.detailItem && !items.some((i) => i.uid === this.detailItem!.uid)) {
        this.drawerOpen = false
        this.detailItem = null
      }
    },

    openDetails(item: FileItem) {
      this.detailItem = item
      this.drawerOpen = true
    },

    /**
     * Open the drawer on the folder you are IN, rather than on a row inside it.
     *
     * Otherwise a folder's own properties — permissions, metadata, its Actions
     * tab — are only reachable from its parent, which is awkward as soon as you
     * have navigated into it, and impossible for anything you cannot go up from.
     *
     * The current folder is not among `items` (that lists its children), so the
     * item is assembled from what the breadcrumb already knows. Only uid, name
     * and isDirectory are read before the drawer stats the uid for itself; the
     * rest are placeholders that are replaced by that call, not displayed.
     *
     * Root has no properties to show and is not a real node here, so it is
     * refused rather than opening an empty drawer.
     */
    openCurrentFolderDetails() {
      if (this.currentUid === ROOT_UID) return
      const here = this.breadcrumbs[this.breadcrumbs.length - 1]
      this.openDetails({
        uid: this.currentUid,
        name: here?.name ?? '',
        type: 'directory',
        isDirectory: true,
        size: 0,
        renditionCount: 0,
        hasRenditions: false,
        deleted: false,
        createdAt: 0,
        modifiedAt: 0,
        owner: '',
        createdBy: '',
        modifiedBy: '',
      })
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

    // Toggle the soft-deleted view and reload (load() re-checks the permission).
    async toggleShowDeleted() {
      this.showDeleted = !this.showDeleted
      await this.load()
    },

    // Restore a soft-deleted file, then reload the listing.
    async undeleteItem(item: FileItem) {
      try {
        await fileService.undeleteFile(item.uid)
        await this.load()
      } catch (e) {
        this.error = errorMessage(e, 'Failed to undelete')
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
      if (!this.clipboard || !this.canPasteHere) return
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
        // A plain navigation, NOT an XHR blob. Fetching into memory first meant
        // a multi-GB file was a multi-GB spike in the tab before a single byte
        // reached disk; this hands the transfer to the browser, which streams
        // it and shows its own progress.
        //
        // The ticket is what makes a navigation possible at all — a navigation
        // cannot set an Authorization header. It is scoped to this one file and
        // expires in seconds (see fileService.downloadUrl).
        const url = await fileService.downloadUrl(item.uid)
        const a = document.createElement('a')
        a.href = url
        a.download = item.name
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        // No object URL to revoke: nothing was ever held in memory.
      } catch (e) {
        this.error = errorMessage(e, 'Failed to download')
      }
    },
  },
})
