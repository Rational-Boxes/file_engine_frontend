export const transformService = {
  // Convert file to PDF
  async convertToPdf(file: File) {
    // For now, this functionality would need to be implemented in the gRPC service
    // For the purpose of this migration, we'll return an error indicating it's not yet implemented
    throw new Error('PDF conversion via gRPC not yet implemented')
  },

  // Optimize image
  async optimizeImage(imageFile: File, options: Record<string, any> = {}) {
    // For now, this functionality would need to be implemented in the gRPC service
    // For the purpose of this migration, we'll return an error indicating it's not yet implemented
    throw new Error('Image optimization via gRPC not yet implemented')
  },

  // Convert CAD file to viewer
  async convertCadToViewer(cadFile: File) {
    // For now, this functionality would need to be implemented in the gRPC service
    // For the purpose of this migration, we'll return an error indicating it's not yet implemented
    throw new Error('CAD conversion via gRPC not yet implemented')
  }
}