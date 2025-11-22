import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fileService } from '@/services/fileService'
import apiService from '@/services/apiService'

// Mock the API service client
const mockGet = vi.fn()
const mockPost = vi.fn()
const mockDelete = vi.fn()

vi.mock('@/services/apiService', () => ({
  default: {
    client: {
      get: mockGet,
      post: mockPost,
      delete: mockDelete,
    }
  }
}))

describe('File Service', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks()
  })

  describe('listDirectory', () => {
    it('should list directory contents successfully', async () => {
      // Arrange
      const mockEntries = [
        { id: 'file1', name: 'test.txt', type: 'file' },
        { id: 'dir1', name: 'subdir', type: 'directory' }
      ]
      
      mockGet.mockResolvedValue({ data: { entries: mockEntries } })
      
      // Act
      const result = await fileService.listDirectory('test-uid')
      
      // Assert
      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockEntries)
      expect(mockGet).toHaveBeenCalledWith('/api/v1/filesystem/dir/test-uid')
    })

    it('should handle list directory errors', async () => {
      // Arrange
      mockGet.mockRejectedValue({ response: { data: { message: 'Directory not found' } } })
      
      // Act
      const result = await fileService.listDirectory('invalid-uid')
      
      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toBe('Directory not found')
    })
  })

  describe('createDirectory', () => {
    it('should create a directory successfully', async () => {
      // Arrange
      const mockResponse = { data: { uid: 'new-dir-uid' } }
      mockPost.mockResolvedValue(mockResponse)
      
      // Act
      const result = await fileService.createDirectory('parent-uid', 'new-dir')
      
      // Assert
      expect(result.success).toBe(true)
      expect(result.data).toBe('new-dir-uid')
      expect(mockPost).toHaveBeenCalledWith('/api/v1/filesystem/mkdir', {
        parent_uid: 'parent-uid',
        name: 'new-dir'
      })
    })

    it('should handle create directory errors', async () => {
      // Arrange
      mockPost.mockRejectedValue({ response: { data: { message: 'Permission denied' } } })
      
      // Act
      const result = await fileService.createDirectory('parent-uid', 'new-dir')
      
      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toBe('Permission denied')
    })
  })

  describe('removeDirectory', () => {
    it('should remove a directory successfully', async () => {
      // Arrange
      mockDelete.mockResolvedValue({})
      
      // Act
      const result = await fileService.removeDirectory('dir-uid')
      
      // Assert
      expect(result.success).toBe(true)
      expect(mockDelete).toHaveBeenCalledWith('/api/v1/filesystem/rmdir/dir-uid')
    })

    it('should handle remove directory errors', async () => {
      // Arrange
      mockDelete.mockRejectedValue({ response: { data: { message: 'Directory not empty' } } })
      
      // Act
      const result = await fileService.removeDirectory('dir-uid')
      
      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toBe('Directory not empty')
    })
  })

  describe('removeFile', () => {
    it('should remove a file successfully', async () => {
      // Arrange
      mockDelete.mockResolvedValue({})
      
      // Act
      const result = await fileService.removeFile('file-uid')
      
      // Assert
      expect(result.success).toBe(true)
      expect(mockDelete).toHaveBeenCalledWith('/api/v1/filesystem/remove/file-uid')
    })

    it('should handle remove file errors', async () => {
      // Arrange
      mockDelete.mockRejectedValue({ response: { data: { message: 'File not found' } } })
      
      // Act
      const result = await fileService.removeFile('file-uid')
      
      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toBe('File not found')
    })
  })

  describe('getFileMetadata', () => {
    it('should get file metadata successfully', async () => {
      // Arrange
      const mockMetadata = { name: 'test.txt', size: 1024 }
      mockGet.mockResolvedValue({ data: { info: mockMetadata } })
      
      // Act
      const result = await fileService.getFileMetadata('file-uid')
      
      // Assert
      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockMetadata)
      expect(mockGet).toHaveBeenCalledWith('/api/v1/filesystem/stat/file-uid')
    })

    it('should handle get file metadata errors', async () => {
      // Arrange
      mockGet.mockRejectedValue({ response: { data: { message: 'File not found' } } })
      
      // Act
      const result = await fileService.getFileMetadata('file-uid')
      
      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toBe('File not found')
    })
  })

  describe('fileExists', () => {
    it('should return true when file exists', async () => {
      // Arrange
      mockGet.mockResolvedValue({ data: { exists: true } })
      
      // Act
      const result = await fileService.fileExists('file-uid')
      
      // Assert
      expect(result).toBe(true)
      expect(mockGet).toHaveBeenCalledWith('/api/v1/filesystem/exists/file-uid')
    })

    it('should return false when file does not exist', async () => {
      // Arrange
      mockGet.mockResolvedValue({ data: { exists: false } })
      
      // Act
      const result = await fileService.fileExists('file-uid')
      
      // Assert
      expect(result).toBe(false)
    })

    it('should return false when request fails', async () => {
      // Arrange
      mockGet.mockRejectedValue(new Error('Network error'))
      
      // Act
      const result = await fileService.fileExists('file-uid')
      
      // Assert
      expect(result).toBe(false)
    })
  })

  describe('getFile', () => {
    it('should get file content successfully', async () => {
      // Arrange
      const mockFileContent = 'file content'
      mockGet.mockResolvedValue({ data: mockFileContent })
      
      // Act
      const result = await fileService.getFile('file-uid')
      
      // Assert
      expect(result.success).toBe(true)
      expect(result.data).toBe(mockFileContent)
      expect(mockGet).toHaveBeenCalledWith('/api/v1/filesystem/get/file-uid', {
        responseType: 'arraybuffer'
      })
    })

    it('should handle get file errors', async () => {
      // Arrange
      mockGet.mockRejectedValue({ response: { data: { message: 'Access denied' } } })
      
      // Act
      const result = await fileService.getFile('file-uid')
      
      // Assert
      expect(result.success).toBe(false)
      expect(result.error).toBe('Access denied')
    })
  })
})