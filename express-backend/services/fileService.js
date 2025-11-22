const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs').promises;
const path = require('path');
const TransformService = require('./transformService');
const CadService = require('./cadService');

class FileService {
  constructor() {
    this.fileEngineApiUrl = process.env.FILEENGINE_API_URL || 'http://localhost:50051'; // Default to gRPC port
    this.jwtSecret = process.env.JWT_SECRET;
  }

  // Upload file to FileEngine with optional transformation
  async uploadFile(file, userId, parentPath = '/', options = {}) {
    try {
      const { transformToPdf = false, convertCad = false } = options;

      // First upload to FileEngine
      const formData = new FormData();
      formData.append('file', fs.createReadStream(file.path));
      formData.append('parent_uid', parentPath);
      formData.append('transform', transformToPdf ? 'pdf' : 'none');
      
      const response = await axios.post(
        `${this.fileEngineApiUrl}/upload`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${this.jwtSecret}` // In real implementation, use user's token
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );

      const uploadResult = response.data;

      // If transformation is requested, perform additional processing
      if (transformToPdf) {
        // FileEngine may return a converted version, or we may need to process it separately
        // depending on when/where the transformation happens
        console.log(`File uploaded and converted to PDF: ${uploadResult.uid}`);
      } else if (convertCad) {
        // Handle CAD conversion separately
        const cadResult = await CadService.convertToWebViewer(file.path, '/tmp/cad-output');
        uploadResult.cadViewer = cadResult;
      }

      return uploadResult;
    } catch (error) {
      console.error('File upload error:', error);
      throw error;
    }
  }

  // Get file metadata from FileEngine
  async getFileInfo(uid, userId) {
    try {
      const response = await axios.get(
        `${this.fileEngineApiUrl}/api/v1/filesystem/stat/${uid}`,
        {
          headers: {
            'Authorization': `Bearer ${this.jwtSecret}` // In real implementation, use user's token
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Get file info error:', error);
      throw error;
    }
  }
  
  // List directory contents from FileEngine
  async listDirectory(uid, userId) {
    try {
      const response = await axios.get(
        `${this.fileEngineApiUrl}/api/v1/filesystem/dir/${uid}`,
        {
          headers: {
            'Authorization': `Bearer ${this.jwtSecret}` // In real implementation, use user's token
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('List directory error:', error);
      throw error;
    }
  }
}

module.exports = new FileService();