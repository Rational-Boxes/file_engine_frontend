import { defineStore } from 'pinia'
import { fileService, type FileItem } from '@/services/fileService'
import { ROOT_UID } from '@/services/apiClient'
import { errorMessage } from '@/services/apiClient'

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
  }),

  actions: {
    async load() {
      this.loading = true
      this.error = null
      this.drawerOpen = false
      this.detailItem = null
      this.renditionsOpen = false
      this.renditionsFor = null
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
