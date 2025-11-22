import { defineStore } from 'pinia'
import { transformService } from '@/services/transformService'

export interface TransformationHistoryItem {
  id: number
  type: 'pdf-conversion' | 'image-optimization' | 'cad-conversion'
  originalFile: string
  result: any
  options?: any
  timestamp: Date
  status: 'completed' | 'failed'
}

export interface TransformationQueueItem {
  id: number
  type: string
  files: string[]
  options: any
  status: 'queued' | 'processing' | 'completed' | 'failed'
  progress: number
  error?: string
}

export const useFileTransformStore = defineStore('fileTransform', {
  state: () => ({
    transformationQueue: [] as TransformationQueueItem[],
    activeTransformations: new Map<number, string>(),
    transformationHistory: [] as TransformationHistoryItem[]
  }),
  
  actions: {
    // Convert file to PDF
    async convertFileToPdf(file: File) {
      try {
        const result = await transformService.convertToPdf(file)
        
        // Add to transformation history
        this.transformationHistory.push({
          id: Date.now(),
          type: 'pdf-conversion',
          originalFile: file.name,
          result: result.convertedFile,
          timestamp: new Date(),
          status: 'completed'
        })
        
        return result
      } catch (error: any) {
        console.error('PDF conversion failed:', error)
        
        // Add to transformation history as failed
        this.transformationHistory.push({
          id: Date.now(),
          type: 'pdf-conversion',
          originalFile: file.name,
          result: null,
          timestamp: new Date(),
          status: 'failed'
        })
        
        throw error
      }
    },
    
    // Optimize image
    async optimizeImageFile(imageFile: File, options = {}) {
      try {
        const result = await transformService.optimizeImage(imageFile, options)
        
        // Add to transformation history
        this.transformationHistory.push({
          id: Date.now(),
          type: 'image-optimization',
          originalFile: imageFile.name,
          result: result.optimizedFile,
          options,
          timestamp: new Date(),
          status: 'completed'
        })
        
        return result
      } catch (error: any) {
        console.error('Image optimization failed:', error)
        
        // Add to transformation history as failed
        this.transformationHistory.push({
          id: Date.now(),
          type: 'image-optimization',
          originalFile: imageFile.name,
          result: null,
          options,
          timestamp: new Date(),
          status: 'failed'
        })
        
        throw error
      }
    },
    
    // Convert CAD to web viewer
    async convertCadToViewer(cadFile: File) {
      try {
        const result = await transformService.convertCadToViewer(cadFile)
        
        // Add to transformation history
        this.transformationHistory.push({
          id: Date.now(),
          type: 'cad-conversion',
          originalFile: cadFile.name,
          result: result.viewerUrl,
          timestamp: new Date(),
          status: 'completed'
        })
        
        return result
      } catch (error: any) {
        console.error('CAD conversion failed:', error)
        
        // Add to transformation history as failed
        this.transformationHistory.push({
          id: Date.now(),
          type: 'cad-conversion',
          originalFile: cadFile.name,
          result: null,
          timestamp: new Date(),
          status: 'failed'
        })
        
        throw error
      }
    },
    
    // Process batch transformation
    async processBatchTransformation(files: File[], transformationType: string, options = {}) {
      const batchId = Date.now()
      const results = []
      
      // Add to queue
      const queueItem: TransformationQueueItem = {
        id: batchId,
        type: transformationType,
        files: files.map(f => f.name),
        options,
        status: 'processing',
        progress: 0
      }
      
      this.transformationQueue.push(queueItem)
      
      try {
        for (let i = 0; i < files.length; i++) {
          let result: any
          
          switch (transformationType) {
            case 'pdf':
              result = await this.convertFileToPdf(files[i])
              break
            case 'optimize':
              result = await this.optimizeImageFile(files[i], options)
              break
            case 'cad':
              result = await this.convertCadToViewer(files[i])
              break
            default:
              throw new Error(`Unsupported transformation type: ${transformationType}`)
          }
          
          results.push(result)
          
          // Update progress
          const progress = ((i + 1) / files.length) * 100
          const queueItem = this.transformationQueue.find(q => q.id === batchId)
          if (queueItem) {
            queueItem.progress = progress
          }
        }
        
        // Update queue status
        const queueItem = this.transformationQueue.find(q => q.id === batchId)
        if (queueItem) {
          queueItem.status = 'completed'
        }
        
        return results
      } catch (error: any) {
        const queueItem = this.transformationQueue.find(q => q.id === batchId)
        if (queueItem) {
          queueItem.status = 'failed'
          queueItem.error = error.message
        }
        
        throw error
      }
    }
  },
  
  getters: {
    getTransformationHistory: (state) => (type: string | null = null) => {
      if (type) {
        return state.transformationHistory.filter(t => t.type === type)
      }
      return state.transformationHistory
    },
    
    getActiveTransformations: (state) => {
      return state.transformationQueue.filter(t => t.status === 'processing')
    }
  }
})