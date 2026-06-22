import { defineStore } from 'pinia'
import { uploadService } from '@/services/uploadService'
import { useFileStore } from '@/stores/files'
import { errorMessage } from '@/services/apiClient'

export interface UploadItem {
  id: string
  name: string
  status: 'uploading' | 'completed' | 'failed'
  progress: number
  error?: string
}

let counter = 0

export const useUploadStore = defineStore('upload', {
  state: () => ({
    queue: [] as UploadItem[],
  }),

  getters: {
    isUploading: (state) => state.queue.some((u) => u.status === 'uploading'),
    // Mean progress across the current batch (for the aggregate bar).
    overallProgress: (state) => {
      if (!state.queue.length) return 0
      const sum = state.queue.reduce((acc, u) => acc + u.progress, 0)
      return Math.round(sum / state.queue.length)
    },
  },

  actions: {
    // Upload a batch into the directory; refresh the file list once done.
    async uploadFiles(parentUid: string, files: File[]) {
      const fileStore = useFileStore()
      for (const file of files) {
        const id = `${Date.now()}-${counter++}`
        const item: UploadItem = { id, name: file.name, status: 'uploading', progress: 0 }
        this.queue.push(item)
        try {
          await uploadService.upload(parentUid, file, (p) => {
            item.progress = p
          })
          item.status = 'completed'
          item.progress = 100
        } catch (e) {
          item.status = 'failed'
          item.error = errorMessage(e, 'Upload failed')
        }
      }
      await fileStore.load()
    },

    clearFinished() {
      this.queue = this.queue.filter((u) => u.status === 'uploading')
    },
  },
})
