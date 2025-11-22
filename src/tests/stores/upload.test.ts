import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUploadStore } from '@/stores/upload'
import * as uploadServiceModule from '@/services/uploadService'

// Mock the upload service
vi.mock('@/services/uploadService', () => ({
  uploadService: {
    directUpload: vi.fn(),
    getUploadInfo: vi.fn(),
    startChunkedUpload: vi.fn(),
    processChunk: vi.fn(),
    finalizeUpload: vi.fn(),
  }
}))

describe('Upload Store', () => {
  beforeEach(() => {
    // Create a fresh pinia instance for each test
    const pinia = createPinia()
    setActivePinia(pinia)
  })

  describe('adding files to queue', () => {
    it('should add a file to the upload queue with pending status', async () => {
      // Arrange
      const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' })
      const mockProgressCallback = vi.fn()
      
      vi.mocked(uploadServiceModule.uploadService.directUpload).mockResolvedValue({
        success: true,
        message: 'Upload successful'
      })
      
      const uploadStore = useUploadStore()
      
      // Act
      const resultPromise = uploadStore.addFileToQueue(mockFile, 'test-dir', mockProgressCallback)
      
      // Wait for the promise to resolve
      await resultPromise
      
      // Assert
      expect(uploadStore.uploadQueue).toHaveLength(1)
      const uploadItem = uploadStore.uploadQueue[0]
      expect(uploadItem.file.name).toBe('test.txt')
      expect(uploadItem.directory).toBe('test-dir')
      expect(uploadItem.status).toBe('completed')
      expect(uploadItem.progress).toBe(100)
    })

    it('should update progress during upload', async () => {
      // Arrange
      const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' })
      const mockProgressCallback = vi.fn()
      
      // Mock the upload service to call progress callback with different values
      const mockDirectUpload = vi.fn().mockImplementation(async (file, dir, onProgress) => {
        // Simulate progress updates
        onProgress(25)
        await new Promise(resolve => setTimeout(resolve, 10))
        onProgress(50)
        await new Promise(resolve => setTimeout(resolve, 10))
        onProgress(75)
        await new Promise(resolve => setTimeout(resolve, 10))
        onProgress(100)
        return { success: true }
      })
      
      vi.mocked(uploadServiceModule.uploadService).directUpload = mockDirectUpload
      
      const uploadStore = useUploadStore()
      
      // Act
      const resultPromise = uploadStore.addFileToQueue(mockFile, 'test-dir', mockProgressCallback)
      await resultPromise
      
      // Assert
      expect(mockProgressCallback).toHaveBeenCalledWith(100)
      expect(uploadStore.uploadQueue[0].progress).toBe(100)
    })

    it('should handle upload errors and set status to failed', async () => {
      // Arrange
      const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' })
      const mockProgressCallback = vi.fn()
      
      vi.mocked(uploadServiceModule.uploadService.directUpload).mockRejectedValue(
        new Error('Upload failed')
      )
      
      const uploadStore = useUploadStore()
      
      // Act & Assert
      await expect(uploadStore.addFileToQueue(mockFile, 'test-dir', mockProgressCallback))
        .rejects.toThrow('Upload failed')
      
      expect(uploadStore.uploadQueue).toHaveLength(1)
      expect(uploadStore.uploadQueue[0].status).toBe('failed')
      expect(uploadStore.uploadQueue[0].error).toBe('Upload failed')
    })
  })

  describe('target directory management', () => {
    it('should set target directory correctly', () => {
      // Arrange
      const uploadStore = useUploadStore()
      
      // Act
      uploadStore.setTargetDirectory('new-target-dir')
      
      // Assert
      expect(uploadStore.targetDirectory).toBe('new-target-dir')
    })
  })

  describe('upload management', () => {
    it('should cancel an upload', () => {
      // Arrange
      const uploadStore = useUploadStore()
      const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' })
      
      // Add an upload to the queue
      const uploadId = Date.now() + Math.random().toString()
      uploadStore.uploadQueue.push({
        id: uploadId,
        file: mockFile,
        directory: 'test-dir',
        status: 'pending',
        progress: 0
      })
      
      // Act
      uploadStore.cancelUpload(uploadId)
      
      // Assert
      const upload = uploadStore.uploadQueue.find(u => u.id === uploadId)
      expect(upload?.status).toBe('cancelled')
    })

    it('should remove an upload from the queue', () => {
      // Arrange
      const uploadStore = useUploadStore()
      const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' })
      
      const uploadId1 = 'upload1'
      const uploadId2 = 'upload2'
      
      uploadStore.uploadQueue.push({
        id: uploadId1,
        file: mockFile,
        directory: 'test-dir',
        status: 'completed',
        progress: 100
      }, {
        id: uploadId2,
        file: mockFile,
        directory: 'test-dir',
        status: 'completed',
        progress: 100
      })
      
      // Act
      uploadStore.removeUpload(uploadId1)
      
      // Assert
      expect(uploadStore.uploadQueue).toHaveLength(1)
      expect(uploadStore.uploadQueue[0].id).toBe(uploadId2)
    })

    it('should clear completed uploads', () => {
      // Arrange
      const uploadStore = useUploadStore()
      const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' })
      
      uploadStore.uploadQueue.push({
        id: 'upload1',
        file: mockFile,
        directory: 'test-dir',
        status: 'completed',
        progress: 100
      }, {
        id: 'upload2',
        file: mockFile,
        directory: 'test-dir',
        status: 'failed',
        progress: 50
      }, {
        id: 'upload3',
        file: mockFile,
        directory: 'test-dir',
        status: 'completed',
        progress: 100
      })
      
      // Act
      uploadStore.clearCompletedUploads()
      
      // Assert
      expect(uploadStore.uploadQueue).toHaveLength(1)
      expect(uploadStore.uploadQueue[0].id).toBe('upload2') // Only failed upload remains
    })
  })

  describe('getter methods', () => {
    it('should return correct upload progress', () => {
      // Arrange
      const uploadStore = useUploadStore()
      const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' })
      
      uploadStore.uploadQueue.push({
        id: 'test-upload',
        file: mockFile,
        directory: 'test-dir',
        status: 'uploading',
        progress: 75
      })
      
      // Act
      const progress = uploadStore.getUploadProgress('test-upload')
      
      // Assert
      expect(progress).toBe(75)
    })

    it('should return correct upload status', () => {
      // Arrange
      const uploadStore = useUploadStore()
      const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' })
      
      uploadStore.uploadQueue.push({
        id: 'test-upload',
        file: mockFile,
        directory: 'test-dir',
        status: 'completed',
        progress: 100
      })
      
      // Act
      const status = uploadStore.getUploadStatus('test-upload')
      
      // Assert
      expect(status).toBe('completed')
    })

    it('should filter uploads by status', () => {
      // Arrange
      const uploadStore = useUploadStore()
      const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' })
      
      uploadStore.uploadQueue.push({
        id: 'upload1',
        file: mockFile,
        directory: 'test-dir',
        status: 'completed',
        progress: 100
      }, {
        id: 'upload2',
        file: mockFile,
        directory: 'test-dir',
        status: 'failed',
        progress: 0
      }, {
        id: 'upload3',
        file: mockFile,
        directory: 'test-dir',
        status: 'completed',
        progress: 100
      })
      
      // Act
      const completedUploads = uploadStore.getUploadsInStatus('completed')
      
      // Assert
      expect(completedUploads).toHaveLength(2)
      expect(completedUploads.every(u => u.status === 'completed')).toBe(true)
    })
  })
})