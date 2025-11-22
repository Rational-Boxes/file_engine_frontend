import apiService from './apiService'

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export const fileService = {
  // List directory contents
  async listDirectory(uid: string): Promise<ApiResponse<any[]>> {
    try {
      const response = await apiService.client.get(`/api/v1/filesystem/dir/${uid}`)
      return {
        success: true,
        data: response.data.entries,
        error: null
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.response?.data?.message || 'Failed to list directory'
      }
    }
  },
  
  // Create directory
  async createDirectory(parentUid: string, name: string): Promise<ApiResponse<string>> {
    try {
      const response = await apiService.client.post('/api/v1/filesystem/mkdir', {
        parent_uid: parentUid,
        name: name
      })
      return {
        success: true,
        data: response.data.uid, // New directory UID
        error: null
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.response?.data?.message || 'Failed to create directory'
      }
    }
  },
  
  // Remove directory
  async removeDirectory(uid: string): Promise<ApiResponse<null>> {
    try {
      await apiService.client.delete(`/api/v1/filesystem/rmdir/${uid}`)
      return {
        success: true,
        error: null
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to remove directory'
      }
    }
  },
  
  // Remove file
  async removeFile(uid: string): Promise<ApiResponse<null>> {
    try {
      await apiService.client.delete(`/api/v1/filesystem/remove/${uid}`)
      return {
        success: true,
        error: null
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to remove file'
      }
    }
  },
  
  // Get file metadata
  async getFileMetadata(uid: string): Promise<ApiResponse<any>> {
    try {
      const response = await apiService.client.get(`/api/v1/filesystem/stat/${uid}`)
      return {
        success: true,
        data: response.data.info,
        error: null
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.response?.data?.message || 'Failed to get file metadata'
      }
    }
  },
  
  // Check if file exists
  async fileExists(uid: string): Promise<boolean> {
    try {
      const response = await apiService.client.get(`/api/v1/filesystem/exists/${uid}`)
      return response.data.exists
    } catch (error) {
      return false
    }
  },
  
  // Get file content
  async getFile(uid: string): Promise<ApiResponse<any>> {
    try {
      const response = await apiService.client.get(`/api/v1/filesystem/get/${uid}`, {
        responseType: 'arraybuffer'
      })
      return {
        success: true,
        data: response.data,
        error: null
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.response?.data?.message || 'Failed to get file'
      }
    }
  }
}