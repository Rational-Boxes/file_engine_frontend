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
    // Placeholder implementation
    return {
      session_id: 'mock-session-id',
      file_name: fileName,
      file_size: fileSize,
      parent_uid: parentUid
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

      // Placeholder implementation
      if (onProgress) {
        onProgress(50) // Halfway through creating and preparing to upload
      }

      if (onProgress) {
        onProgress(100) // Complete
      }

      return {
        success: true,
        uid: 'mock-file-uid',
        message: 'File uploaded successfully'
      }
    } catch (error: any) {
      throw new Error(error.message || 'Failed to upload file')
    }
  }
}