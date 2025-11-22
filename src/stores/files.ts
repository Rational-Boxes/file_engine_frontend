import { defineStore } from 'pinia'
import { fileService } from '@/services/fileService'

export interface FileItem {
  id: string
  name: string
  type: 'file' | 'directory'
  size?: number
  modified?: string
  isDirectory: boolean
  isFile: boolean
}

export const useFileStore = defineStore('files', {
  state: () => ({
    currentPath: '/',
    currentDirectoryItems: [] as FileItem[],
    loading: false,
    directoryCache: new Map<string, FileItem[]>(),
    selectedItems: [] as FileItem[],
    viewMode: 'grid' as 'list' | 'grid',
    breadcrumbs: [] as { name: string; path: string; id: string }[],
    previewItem: null as FileItem | null,
  }),
  
  getters: {
    currentDirectoryUid: (state) => {
      // Convert path to UID based on your path resolution logic
      return this.resolvePathToUid(state.currentPath)
    }
  },
  
  actions: {
    async navigateTo(path: string) {
      this.loading = true
      try {
        // Check if we have this directory in cache
        if (this.directoryCache.has(path)) {
          this.currentDirectoryItems = this.directoryCache.get(path) || []
          this.breadcrumbs = this.generateBreadcrumbs(path)
        } else {
          const result = await fileService.listDirectory(this.resolvePathToUid(path))
          if (result.success) {
            this.currentDirectoryItems = result.data
            this.directoryCache.set(path, result.data)
            this.breadcrumbs = this.generateBreadcrumbs(path)
          }
        }
        this.currentPath = path
        this.clearSelection()
      } catch (error) {
        console.error('Failed to navigate to directory:', error)
      } finally {
        this.loading = false
      }
    },
    
    async createDirectory(name: string) {
      if (!name || name.trim() === '') return
      
      this.loading = true
      try {
        const result = await fileService.createDirectory(
          this.currentDirectoryUid, 
          name.trim()
        )
        if (result.success) {
          // Refresh current directory
          await this.navigateTo(this.currentPath)
        }
      } catch (error) {
        console.error('Failed to create directory:', error)
      } finally {
        this.loading = false
      }
    },
    
    async deleteItem(uid: string) {
      this.loading = true
      try {
        const item = this.currentDirectoryItems.find(item => item.id === uid)
        if (!item) return

        const result = item.isDirectory 
          ? await fileService.removeDirectory(uid)
          : await fileService.removeFile(uid)
        
        if (result.success) {
          // Remove from current directory items
          this.currentDirectoryItems = this.currentDirectoryItems.filter(item => item.id !== uid)
          // Clear selection if deleted item was selected
          this.selectedItems = this.selectedItems.filter(item => item.id !== uid)
        }
      } catch (error) {
        console.error('Failed to delete item:', error)
      } finally {
        this.loading = false
      }
    },
    
    async renameItem(uid: string, newName: string) {
      if (!newName || newName.trim() === '') return
      
      // This would require backend support for rename operation
      // For now, just log the intended action
      console.log(`Rename item ${uid} to ${newName}`)
      
      // Refresh directory to show changes
      await this.navigateTo(this.currentPath)
    },
    
    async downloadItem(uid: string) {
      try {
        const response = await fileService.getFile(uid)
        if (response.success) {
          // Create download link
          const blob = new Blob([response.data], { type: 'application/octet-stream' })
          const url = window.URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = this.currentDirectoryItems.find(item => item.id === uid)?.name || 'file'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          window.URL.revokeObjectURL(url)
        }
      } catch (error) {
        console.error('Failed to download file:', error)
      }
    },
    
    selectItem(item: FileItem, isCtrlClick = false) {
      if (isCtrlClick) {
        const index = this.selectedItems.findIndex(i => i.id === item.id)
        if (index > -1) {
          this.selectedItems.splice(index, 1)
        } else {
          this.selectedItems.push(item)
        }
      } else {
        // Clear previous selection and select only this item
        this.selectedItems = [item]
      }
    },
    
    clearSelection() {
      this.selectedItems = []
    },
    
    openPreview(item: FileItem) {
      this.previewItem = item
    },
    
    closePreview() {
      this.previewItem = null
    },
    
    resolvePathToUid(path: string) {
      // Implement path to UID resolution based on your system
      // This is a placeholder implementation
      return path === '/' ? 'root-uid' : `uid-for-${path}`
    },
    
    generateBreadcrumbs(path: string) {
      const pathParts = path.split('/').filter(p => p)
      const breadcrumbs = [{ name: 'Home', path: '/', id: 'root-uid' }]
      
      let currentPath = ''
      for (const part of pathParts) {
        currentPath += '/' + part
        breadcrumbs.push({ 
          name: part, 
          path: currentPath,
          id: this.resolvePathToUid(currentPath)
        })
      }
      
      return breadcrumbs
    },
    
    refreshCurrentDirectory() {
      // Remove from cache to force reload
      this.directoryCache.delete(this.currentPath)
      return this.navigateTo(this.currentPath)
    }
  }
})