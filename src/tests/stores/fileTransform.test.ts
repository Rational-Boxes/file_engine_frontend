import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useFileTransformStore } from '@/stores/fileTransform'
import * as transformServiceModule from '@/services/transformService'

// Mock the transform service
vi.mock('@/services/transformService', () => ({
  transformService: {
    convertToPdf: vi.fn(),
    optimizeImage: vi.fn(),
    convertCadToViewer: vi.fn(),
  }
}))

describe('File Transform Store', () => {
  beforeEach(() => {
    // Create a fresh pinia instance for each test
    const pinia = createPinia()
    setActivePinia(pinia)
  })

  describe('PDF conversion', () => {
    it('should convert a file to PDF and add to transformation history', async () => {
      // Arrange
      const mockFile = new File(['content'], 'document.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      const mockResult = { convertedFile: '/path/to/converted.pdf' }
      
      vi.mocked(transformServiceModule.transformService.convertToPdf).mockResolvedValue(mockResult)
      
      const transformStore = useFileTransformStore()
      
      // Act
      const result = await transformStore.convertFileToPdf(mockFile)
      
      // Assert
      expect(result).toEqual(mockResult)
      expect(transformStore.transformationHistory).toHaveLength(1)
      expect(transformStore.transformationHistory[0].type).toBe('pdf-conversion')
      expect(transformStore.transformationHistory[0].originalFile).toBe('document.docx')
      expect(transformStore.transformationHistory[0].status).toBe('completed')
    })

    it('should add failed conversion to transformation history', async () => {
      // Arrange
      const mockFile = new File(['content'], 'document.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      
      vi.mocked(transformServiceModule.transformService.convertToPdf).mockRejectedValue(
        new Error('Conversion failed')
      )
      
      const transformStore = useFileTransformStore()
      
      // Act & Assert
      await expect(transformStore.convertFileToPdf(mockFile)).rejects.toThrow('Conversion failed')
      
      expect(transformStore.transformationHistory).toHaveLength(1)
      expect(transformStore.transformationHistory[0].type).toBe('pdf-conversion')
      expect(transformStore.transformationHistory[0].originalFile).toBe('document.docx')
      expect(transformStore.transformationHistory[0].status).toBe('failed')
    })
  })

  describe('image optimization', () => {
    it('should optimize an image and add to transformation history', async () => {
      // Arrange
      const mockFile = new File(['content'], 'image.jpg', { type: 'image/jpeg' })
      const mockOptions = { quality: 85, format: 'webp' }
      const mockResult = { optimizedFile: '/path/to/optimized.webp' }
      
      vi.mocked(transformServiceModule.transformService.optimizeImage).mockResolvedValue(mockResult)
      
      const transformStore = useFileTransformStore()
      
      // Act
      const result = await transformStore.optimizeImageFile(mockFile, mockOptions)
      
      // Assert
      expect(result).toEqual(mockResult)
      expect(transformStore.transformationHistory).toHaveLength(1)
      expect(transformStore.transformationHistory[0].type).toBe('image-optimization')
      expect(transformStore.transformationHistory[0].originalFile).toBe('image.jpg')
      expect(transformStore.transformationHistory[0].options).toEqual(mockOptions)
      expect(transformStore.transformationHistory[0].status).toBe('completed')
    })

    it('should handle image optimization failure', async () => {
      // Arrange
      const mockFile = new File(['content'], 'image.jpg', { type: 'image/jpeg' })
      const mockOptions = { quality: 85, format: 'webp' }
      
      vi.mocked(transformServiceModule.transformService.optimizeImage).mockRejectedValue(
        new Error('Optimization failed')
      )
      
      const transformStore = useFileTransformStore()
      
      // Act & Assert
      await expect(transformStore.optimizeImageFile(mockFile, mockOptions)).rejects.toThrow('Optimization failed')
      
      expect(transformStore.transformationHistory).toHaveLength(1)
      expect(transformStore.transformationHistory[0].type).toBe('image-optimization')
      expect(transformStore.transformationHistory[0].originalFile).toBe('image.jpg')
      expect(transformStore.transformationHistory[0].options).toEqual(mockOptions)
      expect(transformStore.transformationHistory[0].status).toBe('failed')
    })
  })

  describe('CAD conversion', () => {
    it('should convert CAD file to viewer and add to transformation history', async () => {
      // Arrange
      const mockFile = new File(['content'], 'model.step', { type: 'model/step' })
      const mockResult = { viewerUrl: '/viewer/12345', modelPath: '/model/12345.stl' }
      
      vi.mocked(transformServiceModule.transformService.convertCadToViewer).mockResolvedValue(mockResult)
      
      const transformStore = useFileTransformStore()
      
      // Act
      const result = await transformStore.convertCadToViewer(mockFile)
      
      // Assert
      expect(result).toEqual(mockResult)
      expect(transformStore.transformationHistory).toHaveLength(1)
      expect(transformStore.transformationHistory[0].type).toBe('cad-conversion')
      expect(transformStore.transformationHistory[0].originalFile).toBe('model.step')
      expect(transformStore.transformationHistory[0].status).toBe('completed')
    })

    it('should handle CAD conversion failure', async () => {
      // Arrange
      const mockFile = new File(['content'], 'model.step', { type: 'model/step' })
      
      vi.mocked(transformServiceModule.transformService.convertCadToViewer).mockRejectedValue(
        new Error('CAD conversion failed')
      )
      
      const transformStore = useFileTransformStore()
      
      // Act & Assert
      await expect(transformStore.convertCadToViewer(mockFile)).rejects.toThrow('CAD conversion failed')
      
      expect(transformStore.transformationHistory).toHaveLength(1)
      expect(transformStore.transformationHistory[0].type).toBe('cad-conversion')
      expect(transformStore.transformationHistory[0].originalFile).toBe('model.step')
      expect(transformStore.transformationHistory[0].status).toBe('failed')
    })
  })

  describe('batch transformation', () => {
    it('should process multiple files in a batch transformation', async () => {
      // Arrange
      const mockFiles = [
        new File(['content1'], 'doc1.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
        new File(['content2'], 'doc2.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      ]
      
      vi.mocked(transformServiceModule.transformService.convertToPdf)
        .mockResolvedValueOnce({ convertedFile: '/path/to/converted1.pdf' })
        .mockResolvedValueOnce({ convertedFile: '/path/to/converted2.pdf' })
      
      const transformStore = useFileTransformStore()
      
      // Act
      const results = await transformStore.processBatchTransformation(mockFiles, 'pdf', {})
      
      // Assert
      expect(results).toHaveLength(2)
      expect(transformStore.transformationQueue).toHaveLength(1)
      expect(transformStore.transformationQueue[0].status).toBe('completed')
      expect(transformStore.transformationQueue[0].progress).toBe(100)
      expect(transformStore.transformationHistory).toHaveLength(2)
    })

    it('should handle batch transformation failure', async () => {
      // Arrange
      const mockFiles = [
        new File(['content1'], 'doc1.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
        new File(['content2'], 'doc2.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      ]
      
      vi.mocked(transformServiceModule.transformService.convertToPdf)
        .mockResolvedValueOnce({ convertedFile: '/path/to/converted1.pdf' })
        .mockRejectedValue(new Error('Conversion failed'))
      
      const transformStore = useFileTransformStore()
      
      // Act & Assert
      await expect(transformStore.processBatchTransformation(mockFiles, 'pdf', {}))
        .rejects.toThrow('Conversion failed')
      
      expect(transformStore.transformationQueue).toHaveLength(1)
      expect(transformStore.transformationQueue[0].status).toBe('failed')
      expect(transformStore.transformationQueue[0].error).toBe('Conversion failed')
    })
  })

  describe('getter methods', () => {
    it('should return transformation history filtered by type', () => {
      // Arrange
      const transformStore = useFileTransformStore()
      
      transformStore.transformationHistory.push(
        { id: 1, type: 'pdf-conversion', originalFile: 'doc1.docx', result: null, timestamp: new Date(), status: 'completed' },
        { id: 2, type: 'image-optimization', originalFile: 'img.jpg', result: null, timestamp: new Date(), status: 'completed' },
        { id: 3, type: 'pdf-conversion', originalFile: 'doc2.docx', result: null, timestamp: new Date(), status: 'completed' }
      )
      
      // Act
      const pdfHistory = transformStore.getTransformationHistory('pdf-conversion')
      
      // Assert
      expect(pdfHistory).toHaveLength(2)
      expect(pdfHistory.every(item => item.type === 'pdf-conversion')).toBe(true)
    })

    it('should return all transformation history when no type specified', () => {
      // Arrange
      const transformStore = useFileTransformStore()
      
      transformStore.transformationHistory.push(
        { id: 1, type: 'pdf-conversion', originalFile: 'doc1.docx', result: null, timestamp: new Date(), status: 'completed' },
        { id: 2, type: 'image-optimization', originalFile: 'img.jpg', result: null, timestamp: new Date(), status: 'completed' }
      )
      
      // Act
      const allHistory = transformStore.getTransformationHistory()
      
      // Assert
      expect(allHistory).toHaveLength(2)
    })

    it('should return active transformations', () => {
      // Arrange
      const transformStore = useFileTransformStore()
      
      transformStore.transformationQueue.push(
        { id: 1, type: 'pdf', files: ['doc1.docx'], options: {}, status: 'processing', progress: 50 },
        { id: 2, type: 'pdf', files: ['doc2.docx'], options: {}, status: 'completed', progress: 100 },
        { id: 3, type: 'image', files: ['img.jpg'], options: {}, status: 'processing', progress: 30 }
      )
      
      // Act
      const activeTransforms = transformStore.getActiveTransformations()
      
      // Assert
      expect(activeTransforms).toHaveLength(2)
      expect(activeTransforms.every(item => item.status === 'processing')).toBe(true)
    })
  })
})