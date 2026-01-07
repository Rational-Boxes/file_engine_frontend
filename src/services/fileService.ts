import grpcService from './grpcService'

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export const fileService = {
  // List directory contents
  async listDirectory(uid: string): Promise<ApiResponse<any[]>> {
    try {
      const { user, tenant } = grpcService.getUserContext()
      const response = await grpcService.grpcClient.listDirectory(uid, user, tenant)

      if (response.success && response.entries) {
        // Transform gRPC response to match expected format
        const transformedEntries = response.entries.map(entry => ({
          uid: entry.uid,
          name: entry.name,
          type: entry.type === 1 ? 'directory' : 'file', // 1 is DIRECTORY in gRPC enum
          size: entry.size,
          isDirectory: entry.type === 1,
          isFile: entry.type === 0
        }))

        return {
          success: true,
          data: transformedEntries,
          error: null
        }
      } else {
        return {
          success: false,
          data: null,
          error: response.error || 'Failed to list directory'
        }
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message || 'Failed to list directory'
      }
    }
  },

  // Create directory
  async createDirectory(parentUid: string, name: string): Promise<ApiResponse<string>> {
    try {
      const { user, tenant } = grpcService.getUserContext()
      const response = await grpcService.grpcClient.makeDirectory(parentUid, name, user, tenant)

      if (response.success && response.uid) {
        return {
          success: true,
          data: response.uid,
          error: null
        }
      } else {
        return {
          success: false,
          data: null,
          error: response.error || 'Failed to create directory'
        }
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message || 'Failed to create directory'
      }
    }
  },

  // Remove directory
  async removeDirectory(uid: string): Promise<ApiResponse<null>> {
    try {
      const { user, tenant } = grpcService.getUserContext()
      const response = await grpcService.grpcClient.removeDirectory(uid, user, tenant)

      if (response.success) {
        return {
          success: true,
          error: null
        }
      } else {
        return {
          success: false,
          error: response.error || 'Failed to remove directory'
        }
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to remove directory'
      }
    }
  },

  // Remove file
  async removeFile(uid: string): Promise<ApiResponse<null>> {
    try {
      const { user, tenant } = grpcService.getUserContext()
      const response = await grpcService.grpcClient.removeFile(uid, user, tenant)

      if (response.success) {
        return {
          success: true,
          error: null
        }
      } else {
        return {
          success: false,
          error: response.error || 'Failed to remove file'
        }
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to remove file'
      }
    }
  },

  // Get file metadata
  async getFileMetadata(uid: string): Promise<ApiResponse<any>> {
    try {
      const { user, tenant } = grpcService.getUserContext()
      const response = await grpcService.grpcClient.stat(uid, user, tenant)

      if (response.success && response.info) {
        // Transform gRPC response to match expected format
        const fileInfo = {
          uid: response.info.uid,
          name: response.info.name,
          parent_uid: response.info.parent_uid,
          type: response.info.type === 1 ? 'directory' : 'file',
          size: response.info.size,
          owner: response.info.owner,
          permissions: response.info.permissions,
          created_at: response.info.created_at,
          modified_at: response.info.modified_at,
          version: response.info.version
        }

        return {
          success: true,
          data: fileInfo,
          error: null
        }
      } else {
        return {
          success: false,
          data: null,
          error: response.error || 'Failed to get file metadata'
        }
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message || 'Failed to get file metadata'
      }
    }
  },

  // Check if file exists
  async fileExists(uid: string): Promise<boolean> {
    try {
      const { user, tenant } = grpcService.getUserContext()
      const response = await grpcService.grpcClient.exists(uid, user, tenant)
      return response.success && response.exists
    } catch (error: any) {
      console.error('Error checking if file exists:', error)
      return false
    }
  },

  // Get file content
  async getFile(uid: string): Promise<ApiResponse<any>> {
    try {
      const { user, tenant } = grpcService.getUserContext()
      const response = await grpcService.grpcClient.getFile(uid, user, null, tenant)

      if (response.success && response.data) {
        return {
          success: true,
          data: response.data,
          error: null
        }
      } else {
        return {
          success: false,
          data: null,
          error: response.error || 'Failed to get file'
        }
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message || 'Failed to get file'
      }
    }
  }
}