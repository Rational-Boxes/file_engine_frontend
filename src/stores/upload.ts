import { defineStore } from 'pinia'
import { uploadService } from '@/services/uploadService'

export interface UploadItem {
  id: string
  file: File
  directory: string | null
  status: 'pending' | 'uploading' | 'completed' | 'failed' | 'cancelled'
  progress: number
  error?: string
}

export const useUploadStore = defineStore('upload', {
  state: () => ({
    uploadQueue: [] as UploadItem[],
    targetDirectory: null as string | null,
    showUploadModal: false,
    isUploading: false
  }),
  
  getters: {
    getUploadProgress: (state) => (uploadId: string) => {
      const upload = state.uploadQueue.find(u => u.id === uploadId)
      return upload ? upload.progress : 0
    },
    
    getUploadStatus: (state) => (uploadId: string) => {
      const upload = state.uploadQueue.find(u => u.id === uploadId)
      return upload ? upload.status : 'not_found'
    },
    
    getUploadsInStatus: (state) => (status: string) => {
      return state.uploadQueue.filter(upload => upload.status === status)
    }
  },
  
  actions: {
    setTargetDirectory(directoryUid: string) {
      this.targetDirectory = directoryUid
    },
    
    async addFileToQueue(file: File, directoryUid: string | undefined, onProgress: (progress: number) => void) {
      const uploadId = Date.now() + Math.random().toString()
      
      // Add to queue
      const newUpload: UploadItem = {
        id: uploadId,
        file,
        directory: directoryUid || this.targetDirectory,
        status: 'pending',
        progress: 0
      }
      
      this.uploadQueue.push(newUpload)
      
      // Process upload
      try {
        const result = await uploadService.directUpload(
          file, 
          directoryUid || this.targetDirectory,
          (progress: number) => {
            // Update progress in the UI
            const upload = this.uploadQueue.find(u => u.id === uploadId)
            if (upload) {
              upload.progress = progress
              onProgress(progress) // Call the callback for UI updates
            }
          }
        )
        
        // Update upload status
        const upload = this.uploadQueue.find(u => u.id === uploadId)
        if (upload) {
          upload.status = 'completed'
          upload.progress = 100
        }
        
        return result
      } catch (error: any) {
        const upload = this.uploadQueue.find(u => u.id === uploadId)
        if (upload) {
          upload.status = 'failed'
          upload.error = error.message
        }
        
        throw error
      }
    },
    
    async uploadFiles(files: File[], directoryUid: string) {
      this.isUploading = true
      
      try {
        for (const file of files) {
          await this.addFileToQueue(
            file, 
            directoryUid,
            (progress: number) => {
              // Progress update callback
            }
          )
        }
      } finally {
        this.isUploading = false
      }
    },
    
    cancelUpload(uploadId: string) {
      const upload = this.uploadQueue.find(u => u.id === uploadId)
      if (upload) {
        upload.status = 'cancelled'
      }
    },
    
    removeUpload(uploadId: string) {
      this.uploadQueue = this.uploadQueue.filter(u => u.id !== uploadId)
    },
    
    clearCompletedUploads() {
      this.uploadQueue = this.uploadQueue.filter(u => u.status !== 'completed')
    }
  }
})