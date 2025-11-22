import apiService from './apiService'

export const transformService = {
  // Convert file to PDF
  async convertToPdf(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    
    try {
      const response = await apiService.client.post('/api/transform/to-pdf', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      return response.data
    } catch (error: any) {
      throw error
    }
  },
  
  // Optimize image
  async optimizeImage(imageFile: File, options: Record<string, any> = {}) {
    const formData = new FormData()
    formData.append('image', imageFile)
    
    // Add options as query parameters
    const queryString = new URLSearchParams(options).toString()
    
    try {
      const response = await apiService.client.post(
        `/api/transform/optimize-image?${queryString}`, 
        formData, 
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      )
      return response.data
    } catch (error: any) {
      throw error
    }
  },
  
  // Convert CAD file to viewer
  async convertCadToViewer(cadFile: File) {
    const formData = new FormData()
    formData.append('cadFile', cadFile)
    
    try {
      const response = await apiService.client.post('/api/cad/convert-to-viewer', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      return response.data
    } catch (error: any) {
      throw error
    }
  }
}