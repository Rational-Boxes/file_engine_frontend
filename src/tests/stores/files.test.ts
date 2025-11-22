import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useFileStore } from '@/stores/files'
import * as fileServiceModule from '@/services/fileService'

// Mock the file service
vi.mock('@/services/fileService', () => ({
  fileService: {
    listDirectory: vi.fn(),
    createDirectory: vi.fn(),
    removeDirectory: vi.fn(),
    removeFile: vi.fn(),
    getFileMetadata: vi.fn(),
    fileExists: vi.fn(),
    getFile: vi.fn(),
  }
}))

describe('File Store', () => {
  beforeEach(() => {
    // Create a fresh pinia instance for each test
    const pinia = createPinia()
    setActivePinia(pinia)
  })

  describe('navigation', () => {
    it('should navigate to a directory and update state', async () => {
      // Arrange
      const mockItems = [
        { id: 'file1', name: 'test.txt', type: 'file', isDirectory: false, isFile: true },
        { id: 'dir1', name: 'subdir', type: 'directory', isDirectory: true, isFile: false }
      ]
      
      vi.mocked(fileServiceModule.fileService.listDirectory).mockResolvedValue({
        success: true,
        data: mockItems
      })
      
      const fileStore = useFileStore()
      fileStore.directoryCache.clear() // Ensure no cached data
      
      // Act
      await fileStore.navigateTo('/test')
      
      // Assert
      expect(fileStore.currentPath).toBe('/test')
      expect(fileStore.currentDirectoryItems).toEqual(mockItems)
      expect(fileStore.breadcrumbs).toEqual([
        { name: 'Home', path: '/', id: 'root-uid' },
        { name: 'test', path: '/test', id: 'uid-for-/test' }
      ])
      expect(fileStore.loading).toBe(false)
    })

    it('should use cached directory if available', async () => {
      // Arrange
      const mockItems = [
        { id: 'file1', name: 'cached.txt', type: 'file', isDirectory: false, isFile: true }
      ]
      
      const fileStore = useFileStore()
      fileStore.directoryCache.set('/cached', mockItems)
      
      // Act
      await fileStore.navigateTo('/cached')
      
      // Assert
      expect(fileStore.currentDirectoryItems).toEqual(mockItems)
      expect(fileServiceModule.fileService.listDirectory).not.toHaveBeenCalled()
    })

    it('should handle navigation errors gracefully', async () => {
      // Arrange
      vi.mocked(fileServiceModule.fileService.listDirectory).mockRejectedValue(new Error('Network error'))
      
      const fileStore = useFileStore()
      
      // Act
      await fileStore.navigateTo('/error')
      
      // Assert
      expect(fileStore.currentPath).toBe('/error')
      expect(fileStore.currentDirectoryItems).toEqual([])
      expect(fileStore.loading).toBe(false)
    })
  })

  describe('directory operations', () => {
    it('should create a directory and refresh the view', async () => {
      // Arrange
      const fileStore = useFileStore()
      fileStore.currentPath = '/'
      fileStore.currentDirectoryItems = [
        { id: 'existing-dir', name: 'existing', type: 'directory', isDirectory: true, isFile: false }
      ]
      
      vi.mocked(fileServiceModule.fileService.createDirectory).mockResolvedValue({
        success: true,
        data: 'new-dir-uid'
      })
      
      // Mock the navigateTo method to track calls
      const navigateSpy = vi.spyOn(fileStore, 'navigateTo')
      
      // Act
      await fileStore.createDirectory('new-dir')
      
      // Assert
      expect(fileServiceModule.fileService.createDirectory).toHaveBeenCalledWith(
        fileStore.currentDirectoryUid,
        'new-dir'
      )
      expect(navigateSpy).toHaveBeenCalledWith('/')
    })

    it('should delete a directory and update the view', async () => {
      // Arrange
      const fileStore = useFileStore()
      fileStore.currentDirectoryItems = [
        { id: 'dir1', name: 'to-delete', type: 'directory', isDirectory: true, isFile: false },
        { id: 'dir2', name: 'keep', type: 'directory', isDirectory: true, isFile: false }
      ]
      
      vi.mocked(fileServiceModule.fileService.removeDirectory).mockResolvedValue({
        success: true
      })
      
      // Act
      await fileStore.deleteItem('dir1')
      
      // Assert
      expect(fileServiceModule.fileService.removeDirectory).toHaveBeenCalledWith('dir1')
      expect(fileStore.currentDirectoryItems).toEqual([
        { id: 'dir2', name: 'keep', type: 'directory', isDirectory: true, isFile: false }
      ])
    })
  })

  describe('file operations', () => {
    it('should delete a file and update the view', async () => {
      // Arrange
      const fileStore = useFileStore()
      fileStore.currentDirectoryItems = [
        { id: 'file1', name: 'to-delete.txt', type: 'file', isDirectory: false, isFile: true },
        { id: 'file2', name: 'keep.txt', type: 'file', isDirectory: false, isFile: true }
      ]
      
      vi.mocked(fileServiceModule.fileService.removeFile).mockResolvedValue({
        success: true
      })
      
      // Act
      await fileStore.deleteItem('file1')
      
      // Assert
      expect(fileServiceModule.fileService.removeFile).toHaveBeenCalledWith('file1')
      expect(fileStore.currentDirectoryItems).toEqual([
        { id: 'file2', name: 'keep.txt', type: 'file', isDirectory: false, isFile: true }
      ])
    })
  })

  describe('selection management', () => {
    it('should select a single item when ctrl is not pressed', () => {
      // Arrange
      const fileStore = useFileStore()
      const mockItem = { id: 'item1', name: 'test', type: 'file', isDirectory: false, isFile: true }
      
      // Act
      fileStore.selectItem(mockItem, false)
      
      // Assert
      expect(fileStore.selectedItems).toEqual([mockItem])
    })

    it('should toggle selection when ctrl is pressed', () => {
      // Arrange
      const fileStore = useFileStore()
      const mockItem1 = { id: 'item1', name: 'test1', type: 'file', isDirectory: false, isFile: true }
      const mockItem2 = { id: 'item2', name: 'test2', type: 'file', isDirectory: false, isFile: true }
      
      // Select first item
      fileStore.selectItem(mockItem1, false)
      
      // Act - toggle second item
      fileStore.selectItem(mockItem2, true)
      
      // Assert - both should be selected
      expect(fileStore.selectedItems).toEqual([mockItem1, mockItem2])
      
      // Act - toggle first item off
      fileStore.selectItem(mockItem1, true)
      
      // Assert - only second should remain
      expect(fileStore.selectedItems).toEqual([mockItem2])
    })

    it('should clear all selections', () => {
      // Arrange
      const fileStore = useFileStore()
      const mockItem = { id: 'item1', name: 'test', type: 'file', isDirectory: false, isFile: true }
      fileStore.selectedItems = [mockItem]
      
      // Act
      fileStore.clearSelection()
      
      // Assert
      expect(fileStore.selectedItems).toEqual([])
    })
  })

  describe('path utilities', () => {
    it('should generate correct breadcrumbs', () => {
      // Arrange
      const fileStore = useFileStore()
      
      // Act
      const breadcrumbs = fileStore.generateBreadcrumbs('/level1/level2/level3')
      
      // Assert
      expect(breadcrumbs).toEqual([
        { name: 'Home', path: '/', id: 'root-uid' },
        { name: 'level1', path: '/level1', id: 'uid-for-/level1' },
        { name: 'level2', path: '/level1/level2', id: 'uid-for-/level1/level2' },
        { name: 'level3', path: '/level1/level2/level3', id: 'uid-for-/level1/level2/level3' }
      ])
    })
  })
})