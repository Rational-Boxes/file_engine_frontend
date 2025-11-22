import apiService from './apiService'

export const uploadService = {
  // Get upload endpoint information
  async getUploadInfo() {
    try {
      const response = await apiService.client.get('/upload')
      return response.data
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to get upload info')
    }
  },
  
  // Start chunked upload session
  async startChunkedUpload(fileName: string, fileSize: number, parentUid: string) {
    try {
      const response = await apiService.client.post('/api/v1/upload/chunked/start', {
        file_name: fileName,
        file_size: fileSize,
        parent_uid: parentUid
      })
      return response.data
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to start upload')
    }
  },
  
  // Process upload chunk
  async processChunk(sessionId: string, chunk: Blob, chunkIndex: number, totalChunks: number) {
    const formData = new FormData()
    formData.append('session_id', sessionId)
    formData.append('chunk', chunk)
    formData.append('chunk_index', chunkIndex.toString())
    formData.append('total_chunks', totalChunks.toString())
    
    try {
      const response = await apiService.client.post('/api/v1/upload/chunked/process', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      return response.data
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to process chunk')
    }
  },
  
  // Finalize chunked upload
  async finalizeUpload(sessionId: string) {
    try {
      const response = await apiService.client.post('/api/v1/upload/chunked/finalize', {
        session_id: sessionId
      })
      return response.data
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to finalize upload')
    }
  },
  
  // Direct upload for smaller files
  async directUpload(file: File, parentUid: string | null, onProgress?: (progress: number) => void) {
    const formData = new FormData()
    formData.append('file', file)
    if (parentUid) {
      formData.append('parent_uid', parentUid)
    }
    
    try {
      const response = await apiService.client.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent: ProgressEvent) => {
          if (onProgress && progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            onProgress(progress)
          }
        }
      })
      return response.data
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to upload file')
    }
  }
}