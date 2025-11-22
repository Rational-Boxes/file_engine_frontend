# FileEngine Frontend - API Integration Plan

## Overview

This document outlines the detailed plan for integrating the Vue3 frontend with the FileEngine HTTP proxy REST API. It covers all endpoints, authentication handling, error management, and data transformation required for seamless communication between the frontend and backend services.

## API Service Layer Architecture

### Service Structure
The API integration will be organized into separate service modules based on functionality:

```
services/
├── api.js                    # Base API client configuration and interceptors
├── authService.js            # Authentication-related endpoints
├── fileService.js            # File and directory operations
├── uploadService.js          # Upload operations
├── versionService.js         # Version management
├── metadataService.js        # Metadata operations
├── aclService.js            # Access control (future implementation)
└── adminService.js           # Administrative operations (future implementation)
```

### Base API Client Configuration

```javascript
// services/api.js
import axios from 'axios';

const API_BASE_URL = process.env.VUE_APP_FILEENGINE_API_URL || 'http://localhost:8080';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // 60 second timeout
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// Request interceptor to add JWT token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('fileengine_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle common errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - redirect to login
      localStorage.removeItem('fileengine_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```

## Authentication Service

### Endpoints
- OAuth2 integration endpoints (to be implemented based on OAuth2 provider)
- Token validation and refresh
- User session management

### Implementation Plan
```javascript
// services/authService.js
import apiClient from './api';

export const authService = {
  // OAuth2 login flow
  async initiateOAuth(provider) {
    // Redirect to OAuth provider
    window.location.href = `${apiClient.defaults.baseURL}/auth/oauth/${provider}`;
  },
  
  // Token exchange after OAuth callback
  async exchangeCodeForToken(code, state) {
    const response = await apiClient.post('/auth/token', {
      code,
      state
    });
    return response.data;
  },
  
  // Validate current token
  async validateToken() {
    try {
      const response = await apiClient.get('/auth/validate');
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        // Token invalid
        return { valid: false };
      }
      throw error;
    }
  },
  
  // Get user profile information
  async getUserProfile() {
    const response = await apiClient.get('/auth/profile');
    return response.data;
  }
};
```

## File Service Integration

### Directory Operations

#### List Directory Contents
```javascript
// services/fileService.js
export const fileService = {
  // List directory contents
  async listDirectory(uid) {
    try {
      const response = await apiClient.get(`/api/v1/filesystem/dir/${uid}`);
      return {
        success: true,
        data: response.data.entries,
        error: null
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error.response?.data?.message || 'Failed to list directory'
      };
    }
  },
  
  // Create directory
  async createDirectory(parentUid, name) {
    try {
      const response = await apiClient.post('/api/v1/filesystem/mkdir', {
        parent_uid: parentUid,
        name: name
      });
      return {
        success: true,
        data: response.data.uid, // New directory UID
        error: null
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error.response?.data?.message || 'Failed to create directory'
      };
    }
  },
  
  // Remove directory
  async removeDirectory(uid) {
    try {
      await apiClient.delete(`/api/v1/filesystem/rmdir/${uid}`);
      return {
        success: true,
        error: null
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to remove directory'
      };
    }
  }
};
```

### File Operations

#### File Management
```javascript
  // Create empty file
  async createFile(parentUid, name) {
    try {
      const response = await apiClient.post('/api/v1/filesystem/touch', {
        parent_uid: parentUid,
        name: name
      });
      return {
        success: true,
        data: response.data.uid, // New file UID
        error: null
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error.response?.data?.message || 'Failed to create file'
      };
    }
  },
  
  // Remove file
  async removeFile(uid) {
    try {
      await apiClient.delete(`/api/v1/filesystem/remove/${uid}`);
      return {
        success: true,
        error: null
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to remove file'
      };
    }
  },
  
  // Get file metadata
  async getFileMetadata(uid) {
    try {
      const response = await apiClient.get(`/api/v1/filesystem/stat/${uid}`);
      return {
        success: true,
        data: response.data.info,
        error: null
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error.response?.data?.message || 'Failed to get file metadata'
      };
    }
  },
  
  // Check if file exists
  async fileExists(uid) {
    try {
      const response = await apiClient.get(`/api/v1/filesystem/exists/${uid}`);
      return response.data.exists;
    } catch (error) {
      return false;
    }
  }
};
```

### Upload Service

#### Upload Operations
```javascript
// services/uploadService.js
import apiClient from './api';

export const uploadService = {
  // Get upload endpoint information
  async getUploadInfo() {
    try {
      const response = await apiClient.get('/upload');
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to get upload info');
    }
  },
  
  // Start chunked upload session
  async startChunkedUpload(fileName, fileSize, parentUid) {
    try {
      const response = await apiClient.post('/api/v1/upload/chunked/start', {
        file_name: fileName,
        file_size: fileSize,
        parent_uid: parentUid
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to start upload');
    }
  },
  
  // Process upload chunk
  async processChunk(sessionId, chunk, chunkIndex, totalChunks) {
    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('chunk', chunk);
    formData.append('chunk_index', chunkIndex);
    formData.append('total_chunks', totalChunks);
    
    try {
      const response = await apiClient.post('/api/v1/upload/chunked/process', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to process chunk');
    }
  },
  
  // Finalize chunked upload
  async finalizeUpload(sessionId) {
    try {
      const response = await apiClient.post('/api/v1/upload/chunked/finalize', {
        session_id: sessionId
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to finalize upload');
    }
  },
  
  // Direct upload for smaller files
  async directUpload(file, parentUid, onProgress) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('parent_uid', parentUid);
    
    try {
      const response = await apiClient.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress(progress);
          }
        }
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to upload file');
    }
  }
};
```

### Version Service

#### Version Management
```javascript
// services/versionService.js
import apiClient from './api';

export const versionService = {
  // List file versions
  async listVersions(uid) {
    try {
      const response = await apiClient.get(`/api/v1/filesystem/versions/${uid}`);
      return {
        success: true,
        data: response.data.versions,
        error: null
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error.response?.data?.message || 'Failed to list versions'
      };
    }
  },
  
  // Get specific version
  async getVersion(uid, version) {
    try {
      const response = await apiClient.get(`/api/v1/filesystem/version/${uid}/${version}`);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to get version');
    }
  }
};
```

### Metadata Service

#### Metadata Operations
```javascript
// services/metadataService.js
import apiClient from './api';

export const metadataService = {
  // Set metadata value
  async setMetadata(uid, key, value) {
    try {
      const response = await apiClient.post('/api/v1/filesystem/metadata/set', {
        uid,
        key,
        value
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to set metadata');
    }
  },
  
  // Get metadata value
  async getMetadata(uid, key) {
    try {
      const response = await apiClient.get(`/api/v1/filesystem/metadata/get/${uid}/${key}`);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to get metadata');
    }
  },
  
  // Get all metadata
  async getAllMetadata(uid) {
    try {
      const response = await apiClient.get(`/api/v1/filesystem/metadata/all/${uid}`);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to get metadata');
    }
  },
  
  // Delete metadata
  async deleteMetadata(uid, key) {
    try {
      await apiClient.delete(`/api/v1/filesystem/metadata/delete/${uid}/${key}`);
      return { success: true };
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Failed to delete metadata');
    }
  }
};
```

## Error Handling Strategy

### API Error Response Format
The FileEngine HTTP proxy returns errors in the following format:
```json
{
  "success": false,
  "error": "Error message"
}
```

### Error Handling Implementation
```javascript
// utils/errorHandler.js
export const handleApiError = (error, defaultMessage = 'An error occurred') => {
  if (error.response) {
    // Server responded with error status
    switch (error.response.status) {
      case 400:
        return { message: error.response.data?.error || 'Bad request', code: 'BAD_REQUEST' };
      case 401:
        return { message: 'Authentication required', code: 'UNAUTHORIZED' };
      case 403:
        return { message: 'Access forbidden', code: 'FORBIDDEN' };
      case 404:
        return { message: 'Resource not found', code: 'NOT_FOUND' };
      case 429:
        return { message: 'Rate limit exceeded', code: 'RATE_LIMITED' };
      case 500:
        return { message: 'Internal server error', code: 'INTERNAL_ERROR' };
      default:
        return { message: error.response.data?.error || defaultMessage, code: 'UNKNOWN_ERROR' };
    }
  } else if (error.request) {
    // Request made but no response received
    return { message: 'Network error - unable to reach server', code: 'NETWORK_ERROR' };
  } else {
    // Something else happened
    return { message: error.message || defaultMessage, code: 'CLIENT_ERROR' };
  }
};
```

## Data Transformation Layer

### Response Transformation
```javascript
// utils/responseTransformers.js

// Transform directory listing response
export const transformDirectoryEntries = (entries) => {
  return entries.map(entry => ({
    id: entry.uid,
    name: entry.name,
    type: entry.type,
    size: entry.size,
    isDirectory: entry.type === 'directory',
    isFile: entry.type === 'file'
  }));
};

// Transform file metadata response
export const transformFileMetadata = (metadata) => {
  return {
    id: metadata.uid,
    name: metadata.name,
    type: metadata.type,
    size: metadata.size,
    owner: metadata.owner,
    permissions: metadata.permissions
  };
};

// Transform upload response
export const transformUploadResponse = (response) => {
  return {
    sessionId: response.session_id,
    fileName: response.file_name,
    fileSize: response.file_size,
    parentUid: response.parent_uid,
    success: response.success
  };
};
```

## API Integration Best Practices

### 1. Consistent Response Handling
Every API service method follows the same response pattern:

```javascript
async someApiCall(parameters) {
  try {
    const response = await apiClient.get('/endpoint');
    return {
      success: true,
      data: response.data,
      error: null
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error.message
    };
  }
}
```

### 2. Retry Logic
Implement configurable retry logic for transient failures:

```javascript
// utils/retryHandler.js
export const withRetry = async (fn, maxRetries = 3, delay = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i))); // Exponential backoff
    }
  }
};
```

### 3. Request Caching
Use Vue's reactivity and Pinia to cache responses:

```javascript
// stores/files.js
export const useFileStore = defineStore('files', {
  state: () => ({
    directoryCache: new Map(),
    fileCache: new Map()
  }),
  
  actions: {
    async getCachedDirectory(uid) {
      if (this.directoryCache.has(uid)) {
        return this.directoryCache.get(uid);
      }
      
      const result = await fileService.listDirectory(uid);
      if (result.success) {
        this.directoryCache.set(uid, result.data);
      }
      return result;
    },
    
    invalidateDirectoryCache(uid) {
      this.directoryCache.delete(uid);
    }
  }
});
```

### 4. Loading States
Manage loading states for better UX:

```javascript
// composables/useLoading.js
import { ref } from 'vue';

export const useLoading = () => {
  const loading = ref(false);
  
  const withLoading = async (asyncFn) => {
    loading.value = true;
    try {
      return await asyncFn();
    } finally {
      loading.value = false;
    }
  };
  
  return { loading, withLoading };
};
```

This API integration plan provides a robust foundation for connecting the Vue3 frontend to the FileEngine HTTP proxy, ensuring proper error handling, authentication, and data transformation.