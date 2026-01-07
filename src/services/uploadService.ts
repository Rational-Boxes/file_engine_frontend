import grpcService from './grpcService'
import { fileService } from './fileService'

export const uploadService = {
  // Get upload endpoint information
  async getUploadInfo() {
    // With gRPC, we don't need a separate upload endpoint
    // Instead, we'll use the touch and putFile methods directly
    return {
      uploadUrl: 'grpc://direct',
      maxFileSize: 100 * 1024 * 1024, // 100MB default
      supportedFormats: ['*/*']
    }
  },

  // Start chunked upload session
  async startChunkedUpload(fileName: string, fileSize: number, parentUid: string) {
    // With gRPC, we create the file first using touch, then upload data using putFile
    try {
      const { user, tenant } = grpcService.getUserContext()
      const response = await grpcService.grpcClient.touch(parentUid, fileName, user, tenant)

      if (response.success && response.uid) {
        return {
          session_id: response.uid,
          file_name: fileName,
          file_size: fileSize,
          parent_uid: parentUid
        }
      } else {
        throw new Error(response.error || 'Failed to start upload')
      }
    } catch (error: any) {
      throw new Error(error.message || 'Failed to start upload')
    }
  },

  // Process upload chunk (not directly supported in this gRPC implementation)
  async processChunk(sessionId: string, chunk: Blob, chunkIndex: number, totalChunks: number) {
    // For simplicity in this implementation, we'll upload the entire file in one go
    // In a real implementation, you might implement actual chunking
    throw new Error('Chunked upload not implemented in gRPC client')
  },

  // Finalize chunked upload
  async finalizeUpload(sessionId: string) {
    // With our simplified approach, finalization is handled by the putFile operation
    return { success: true, session_id: sessionId }
  },

  // Direct upload for smaller files
  async directUpload(file: File, parentUid: string | null, onProgress?: (progress: number) => void) {
    try {
      if (!parentUid) {
        throw new Error('Parent UID is required for upload')
      }

      // First, create the file using touch
      const { user, tenant } = grpcService.getUserContext()
      const touchResponse = await grpcService.grpcClient.touch(parentUid, file.name, user, tenant)

      if (!touchResponse.success || !touchResponse.uid) {
        throw new Error(touchResponse.error || 'Failed to create file')
      }

      const fileUid = touchResponse.uid

      // Then upload the file content using putFile
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Simulate progress
      if (onProgress) {
        onProgress(50) // Halfway through creating and preparing to upload
      }

      const putResponse = await grpcService.grpcClient.putFile(fileUid, buffer, user, tenant)

      if (putResponse.success) {
        if (onProgress) {
          onProgress(100) // Complete
        }
        return {
          success: true,
          uid: fileUid,
          message: 'File uploaded successfully'
        }
      } else {
        throw new Error(putResponse.error || 'Failed to upload file content')
      }
    } catch (error: any) {
      throw new Error(error.message || 'Failed to upload file')
    }
  }
}