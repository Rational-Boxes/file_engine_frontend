# FileEngine Frontend - ExpressJS Backend Integration for File Transformations

## Overview

This document outlines the design for the ExpressJS backend component that will enable file transformations and serve as an intermediary between the Vue3 frontend and the FileEngine REST proxy. The ExpressJS backend provides several key functions:
1. File format conversion services (with OpenOffice/LibreOffice integration)
2. XeoKit CAD format conversion to web viewer
3. Backend logic for advanced file operations
4. Caching and performance optimization layer
5. Additional security and business logic layer

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Vue3 Frontend │◄──►│ ExpressJS Server │◄──►│ FileEngine HTTP  │◄──►│ FileEngine gRPC │
│                 │    │                  │    │      Proxy       │    │    Service      │
│ (User Interface)│    │ (Transformations,│    │   (REST API)     │    │                 │
└─────────────────┘    │ Business Logic)  │    └──────────────────┘    └─────────────────┘
                       └──────────────────┘
                              │
                    ┌──────────────────┐
                    │  Transformation  │
                    │   Services       │
                    │ (OpenOffice,     │
                    │  XeoKit, etc.)   │
                    └──────────────────┘
```

## ExpressJS Backend Design

### Server Structure
```
express-backend/
├── app.js                    # Main Express application
├── routes/                   # API route definitions
│   ├── auth.js               # Authentication routes
│   ├── files.js              # File operations routes
│   ├── transform.js          # File transformation routes
│   └── cad.js                # CAD conversion routes
├── middleware/               # Custom middleware
│   ├── auth.js               # JWT validation
│   ├── file-validation.js    # File validation
│   └── rate-limiting.js      # Rate limiting
├── services/                 # Business logic services
│   ├── fileService.js        # File operations
│   ├── transformService.js   # Format conversion
│   ├── cadService.js         # CAD conversion
│   └── authService.js        # Auth utilities
├── utils/                    # Utility functions
│   ├── fileUtils.js          # File utilities
│   └── cacheUtils.js         # Caching utilities
├── config/                   # Configuration
│   └── index.js              # Configuration management
└── package.json              # Dependencies and scripts
```

### Main Express Server Implementation

```javascript
// express-backend/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fileUpload = require('express-fileupload');
const { verifyJWT } = require('./middleware/auth');
const { handleFileTransformations } = require('./middleware/file-validation');

// Import routes
const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const transformRoutes = require('./routes/transform');
const cadRoutes = require('./routes/cad');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // Limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// File upload middleware
app.use(fileUpload({
  createParentPath: true,
  limits: { 
    fileSize: 50 * 1024 * 1024 // 50MB max file size
  },
  useTempFiles: true,
  tempFileDir: '/tmp/'
}));

// Authentication middleware for protected routes
app.use('/api', verifyJWT);

// Route definitions
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/transform', transformRoutes);
app.use('/api/cad', cadRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

module.exports = app;
```

## File Transformation Services

### Format Conversion Service

```javascript
// express-backend/services/transformService.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

class TransformService {
  constructor() {
    this.openOfficePath = process.env.OPENOFFICE_PATH || '/usr/bin/libreoffice';
    this.supportedFormats = {
      document: ['.doc', '.docx', '.odt', '.rtf', '.txt', '.html'],
      spreadsheet: ['.xls', '.xlsx', '.ods', '.csv'],
      presentation: ['.ppt', '.pptx', '.odp'],
      image: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff']
    };
  }

  async convertToPdf(inputPath, outputDir) {
    return new Promise((resolve, reject) => {
      const outputPath = path.join(outputDir, `${path.basename(inputPath, path.extname(inputPath))}.pdf`);

      const child = spawn(this.openOfficePath, [
        '--headless',
        '--convert-to', 'pdf',
        '--outdir', outputDir,
        inputPath
      ]);

      let stderr = '';
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`Conversion failed: ${stderr}`));
        }
      });
    });
  }

  async convertDocument(inputPath, targetFormat) {
    // Determine target format if not specified
    const targetExt = targetFormat || this.getDefaultTargetFormat(inputPath);

    const outputPath = path.join(
      path.dirname(inputPath),
      `${path.basename(inputPath, path.extname(inputPath))}.${targetExt}`
    );

    // Implementation for format conversion would go here
    // This would use LibreOffice or other conversion tools
    throw new Error('Document conversion not fully implemented');
  }

  getDefaultTargetFormat(inputPath) {
    const ext = path.extname(inputPath).toLowerCase();

    if (this.supportedFormats.document.includes(ext)) {
      return 'pdf';
    } else if (this.supportedFormats.spreadsheet.includes(ext)) {
      return 'csv';
    } else if (this.supportedFormats.presentation.includes(ext)) {
      return 'pdf';
    }

    return 'pdf'; // Default fallback
  }

  async optimizeImage(inputPath, options = {}) {
    // Image optimization using Sharp or similar library
    const sharp = require('sharp');

    const {
      quality = 80,
      maxWidth = 1920,
      maxHeight = 1080,
      format = 'webp'
    } = options;

    const outputPath = path.join(
      path.dirname(inputPath),
      `${path.parse(inputPath).name}_optimized.${format}`
    );

    await sharp(inputPath)
      .resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality })
      .webp({ quality })
      .toFile(outputPath);

    return outputPath;
  }
}

module.exports = new TransformService();
```

### CAD Conversion Service (XeoKit Integration)

The Xeokit framework is an open-source JavaScript library for 3D visualization of BIM and CAD models in web applications. The frontend component will use the Xeokit WebGL viewer components for viewing and marking-up 3D CAD files. The JS/TS backend uses Xeokit converter tools to translate the models between formats and make viewer-specific formats. More information about Xeokit can be found on the project website: https://xeokit.io/

```javascript
// express-backend/services/cadService.js
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');

class CadService {
  constructor() {
    this.supportedCadFormats = ['.step', '.stp', '.iges', '.igs', '.stl', '.obj', '.dae', '.fbx'];
    this.viewerOutputDir = process.env.CAD_VIEWER_OUTPUT || './cad-viewers';
  }

  async convertToWebViewer(inputPath, outputDir) {
    const ext = path.extname(inputPath).toLowerCase();

    if (!this.supportedCadFormats.includes(ext)) {
      throw new Error(`Unsupported CAD format: ${ext}`);
    }

    // Generate unique ID for this conversion
    const conversionId = `cad_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const outputSubdir = path.join(outputDir, conversionId);

    await fs.mkdir(outputSubdir, { recursive: true });

    if (ext === '.stl') {
      // For STL files, we can directly use them with Xeokit
      return await this.processStlFile(inputPath, outputSubdir);
    } else {
      // Convert other CAD formats to X3D or glTF for web viewing
      return await this.convertCadToWebFormat(inputPath, outputSubdir);
    }
  }

  async processStlFile(inputPath, outputDir) {
    // Copy STL file to output directory
    const outputStlPath = path.join(outputDir, path.basename(inputPath));
    await fs.copyFile(inputPath, outputStlPath);

    // Generate XeoKit viewer HTML
    const viewerHtml = this.generateXeoKitViewer(outputStlPath);
    const viewerPath = path.join(outputDir, 'viewer.html');

    await fs.writeFile(viewerPath, viewerHtml);

    return {
      viewerUrl: `/cad-viewer/${path.basename(outputDir)}/viewer.html`,
      modelPath: `/cad-viewer/${path.basename(outputDir)}/${path.basename(inputPath)}`,
      format: 'stl'
    };
  }

  async convertCadToWebFormat(inputPath, outputDir) {
    // This would typically use Open CASCADE, FreeCAD, or similar CAD libraries
    // For now, this is a placeholder implementation

    return new Promise((resolve, reject) => {
      // Example using FreeCAD command line (if available)
      const freecad = spawn('freecadcmd', [
        '--console',
        '-c', `import FreeCAD, Import; doc = FreeCAD.newDocument(); Import.insert(u"${inputPath}", doc.Name); __export__("${outputDir}/output.stl"); FreeCAD.closeDocument(doc.Name)`
      ]);

      let stderr = '';
      freecad.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      freecad.on('close', (code) => {
        if (code === 0) {
          resolve({
            viewerUrl: `/cad-viewer/${path.basename(outputDir)}/viewer.html`,
            modelPath: `/cad-viewer/${path.basename(outputDir)}/output.stl`,
            format: 'stl'
          });
        } else {
          reject(new Error(`CAD conversion failed: ${stderr}`));
        }
      });
    });
  }

  generateXeoKitViewer(modelPath) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>CAD Model Viewer</title>
    <script src="https://cdn.jsdelivr.net/npm/xeokit-convert@2.0.11/dist/xeokit-convert.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/xeokit-sdk@1.0.0/dist/xeokit-sdk.js"></script>
    <style>
        body { margin: 0; padding: 0; overflow: hidden; }
        #viewer { width: 100vw; height: 100vh; }
    </style>
</head>
<body>
    <div id="viewer"></div>
    <script>
        const viewer = new XEO.viewer({
            element: document.getElementById("viewer"),
            transparent: true
        });

        // Load the CAD model
        new XEO.plugins.STLLoader(viewer).load({
            id: "myModel",
            src: "${modelPath}",
            edges: true,
            edgeThreshold: 20
        });
    </script>
</body>
</html>
    `;
  }
}

module.exports = new CadService();
```

## API Routes for Transformations

### File Transformations Route

```javascript
// express-backend/routes/transform.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { TransformService } = require('../services/transformService');

// Configure multer for file handling
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, '/tmp/uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Convert file to PDF
router.post('/to-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const outputPath = await TransformService.convertToPdf(
      req.file.path, 
      path.dirname(req.file.path)
    );

    res.json({
      success: true,
      convertedFile: outputPath,
      message: 'File converted to PDF successfully'
    });
  } catch (error) {
    console.error('PDF conversion error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Optimize image
router.post('/optimize-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    // Get optimization options from query parameters
    const options = {
      quality: parseInt(req.query.quality) || 80,
      maxWidth: parseInt(req.query.maxWidth) || 1920,
      maxHeight: parseInt(req.query.maxHeight) || 1080,
      format: req.query.format || 'webp'
    };

    const outputPath = await TransformService.optimizeImage(req.file.path, options);

    res.json({
      success: true,
      optimizedFile: outputPath,
      message: 'Image optimized successfully'
    });
  } catch (error) {
    console.error('Image optimization error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Format conversion endpoint
router.post('/convert', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const targetFormat = req.body.targetFormat || 'pdf';
    const result = await TransformService.convertDocument(req.file.path, targetFormat);

    res.json({
      success: true,
      convertedFile: result,
      message: `File converted to ${targetFormat} successfully`
    });
  } catch (error) {
    console.error('Format conversion error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

### CAD Conversion Route

```javascript
// express-backend/routes/cad.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const CadService = require('../services/cadService');

// Configure multer for CAD file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, '/tmp/cad-uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Convert CAD file to web viewer
router.post('/convert-to-viewer', upload.single('cadFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CAD file uploaded' });
    }

    // Output directory for the converted viewer
    const outputDir = path.join(__dirname, '../cad-viewers');
    await fs.mkdir(outputDir, { recursive: true });

    const result = await CadService.convertToWebViewer(req.file.path, outputDir);

    res.json({
      success: true,
      viewerUrl: result.viewerUrl,
      modelPath: result.modelPath,
      format: result.format,
      message: 'CAD file converted to web viewer successfully'
    });
  } catch (error) {
    console.error('CAD conversion error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get CAD viewer by ID
router.get('/viewer/:id', async (req, res) => {
  try {
    const viewerPath = path.join(__dirname, `../cad-viewers/${req.params.id}/viewer.html`);
    
    // Check if viewer exists
    try {
      await fs.access(viewerPath);
      res.sendFile(viewerPath);
    } catch (error) {
      res.status(404).json({ error: 'CAD viewer not found' });
    }
  } catch (error) {
    console.error('Get CAD viewer error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

## Integration with FileEngine REST API

### File Operations Service with Transformations

```javascript
// express-backend/services/fileService.js
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs').promises;
const path = require('path');
const TransformService = require('./transformService');
const CadService = require('./cadService');

class FileService {
  constructor() {
    this.fileEngineApiUrl = process.env.FILEENGINE_API_URL || 'http://localhost:8080';
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

  // Download and potentially transform file
  async downloadAndTransform(uid, transformationType, userId) {
    try {
      // First, get the file from FileEngine
      const response = await axios.get(
        `${this.fileEngineApiUrl}/api/v1/filesystem/get/${uid}`,
        {
          headers: {
            'Authorization': `Bearer ${this.jwtSecret}`, // In real implementation, use user's token
            'Accept': 'application/octet-stream'
          },
          responseType: 'stream'
        }
      );

      // Create temporary file to store the downloaded content
      const tempPath = `/tmp/file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Write stream to temporary file
      const writer = fs.createWriteStream(tempPath);
      response.data.pipe(writer);
      
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      // Apply transformation based on type
      let resultPath;
      switch (transformationType) {
        case 'pdf':
          resultPath = await TransformService.convertToPdf(tempPath, path.dirname(tempPath));
          break;
        case 'optimize-image':
          resultPath = await TransformService.optimizeImage(tempPath);
          break;
        case 'cad-viewer':
          resultPath = await CadService.convertToWebViewer(tempPath, '/tmp/cad-output');
          break;
        default:
          resultPath = tempPath; // No transformation
      }

      // Read the transformed file and return it
      const fileBuffer = await fs.readFile(resultPath);
      
      // Clean up temporary files
      await fs.unlink(tempPath);
      if (resultPath !== tempPath) {
        await fs.unlink(resultPath);
      }

      return fileBuffer;
    } catch (error) {
      console.error('File download and transform error:', error);
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
```

## Frontend Integration

### API Service for ExpressJS Backend

```javascript
// frontend/src/services/transformService.js
import apiClient from './api';

export const transformService = {
  // Convert file to PDF
  async convertToPdf(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await apiClient.post('/api/transform/to-pdf', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  
  // Optimize image
  async optimizeImage(imageFile, options = {}) {
    const formData = new FormData();
    formData.append('image', imageFile);
    
    // Add options as query parameters
    const queryString = new URLSearchParams(options).toString();
    
    try {
      const response = await apiClient.post(
        `/api/transform/optimize-image?${queryString}`, 
        formData, 
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },
  
  // Convert CAD file to viewer
  async convertCadToViewer(cadFile) {
    const formData = new FormData();
    formData.append('cadFile', cadFile);
    
    try {
      const response = await apiClient.post('/api/cad/convert-to-viewer', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};
```

### File Operations with Transformations Store

```javascript
// frontend/src/stores/fileTransformations.js
import { defineStore } from 'pinia';
import { transformService } from '@/services/transformService';

export const useFileTransformStore = defineStore('fileTransform', {
  state: () => ({
    transformationQueue: [],
    activeTransformations: new Map(),
    transformationHistory: []
  }),
  
  actions: {
    // Convert file to PDF
    async convertFileToPdf(file) {
      try {
        const result = await transformService.convertToPdf(file);
        
        // Add to transformation history
        this.transformationHistory.push({
          id: Date.now(),
          type: 'pdf-conversion',
          originalFile: file.name,
          result: result.convertedFile,
          timestamp: new Date(),
          status: 'completed'
        });
        
        return result;
      } catch (error) {
        console.error('PDF conversion failed:', error);
        throw error;
      }
    },
    
    // Optimize image
    async optimizeImageFile(imageFile, options = {}) {
      try {
        const result = await transformService.optimizeImage(imageFile, options);
        
        // Add to transformation history
        this.transformationHistory.push({
          id: Date.now(),
          type: 'image-optimization',
          originalFile: imageFile.name,
          result: result.optimizedFile,
          options,
          timestamp: new Date(),
          status: 'completed'
        });
        
        return result;
      } catch (error) {
        console.error('Image optimization failed:', error);
        throw error;
      }
    },
    
    // Convert CAD to web viewer
    async convertCadToViewer(cadFile) {
      try {
        const result = await transformService.convertCadToViewer(cadFile);
        
        // Add to transformation history
        this.transformationHistory.push({
          id: Date.now(),
          type: 'cad-conversion',
          originalFile: cadFile.name,
          result: result.viewerUrl,
          timestamp: new Date(),
          status: 'completed'
        });
        
        return result;
      } catch (error) {
        console.error('CAD conversion failed:', error);
        throw error;
      }
    },
    
    // Process batch transformation
    async processBatchTransformation(files, transformationType, options = {}) {
      const batchId = Date.now();
      const results = [];
      
      // Add to queue
      this.transformationQueue.push({
        id: batchId,
        type: transformationType,
        files: files.map(f => f.name),
        options,
        status: 'processing',
        progress: 0
      });
      
      try {
        for (let i = 0; i < files.length; i++) {
          let result;
          
          switch (transformationType) {
            case 'pdf':
              result = await this.convertFileToPdf(files[i]);
              break;
            case 'optimize':
              result = await this.optimizeImageFile(files[i], options);
              break;
            case 'cad':
              result = await this.convertCadToViewer(files[i]);
              break;
          }
          
          results.push(result);
          
          // Update progress
          const progress = ((i + 1) / files.length) * 100;
          const queueItem = this.transformationQueue.find(q => q.id === batchId);
          if (queueItem) {
            queueItem.progress = progress;
          }
        }
        
        // Update queue status
        const queueItem = this.transformationQueue.find(q => q.id === batchId);
        if (queueItem) {
          queueItem.status = 'completed';
        }
        
        return results;
      } catch (error) {
        const queueItem = this.transformationQueue.find(q => q.id === batchId);
        if (queueItem) {
          queueItem.status = 'failed';
          queueItem.error = error.message;
        }
        
        throw error;
      }
    }
  },
  
  getters: {
    getTransformationHistory: (state) => (type = null) => {
      if (type) {
        return state.transformationHistory.filter(t => t.type === type);
      }
      return state.transformationHistory;
    },
    
    getActiveTransformations: (state) => {
      return state.transformationQueue.filter(t => t.status === 'processing');
    }
  }
});
```

## Security Considerations

### Backend Security Implementation

```javascript
// express-backend/middleware/file-validation.js
const path = require('path');
const fs = require('fs').promises;
const FileType = require('file-type');
const maxSize = 50 * 1024 * 1024; // 50MB

const allowedMimeTypes = [
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/tiff',
  
  // CAD formats
  'model/step',
  'model/iges',
  'model/stl',
  'model/vnd.fbx'
];

const handleFileTransformations = async (req, res, next) => {
  if (!req.files) {
    return next();
  }

  for (const fileKey in req.files) {
    const file = Array.isArray(req.files[fileKey]) ? req.files[fileKey][0] : req.files[fileKey];
    
    // Check file size
    if (file.size > maxSize) {
      return res.status(400).json({ error: 'File too large' });
    }
    
    // Check file type
    const fileType = await FileType.fromFile(file.tempFilePath);
    if (!fileType || !allowedMimeTypes.includes(fileType.mime)) {
      return res.status(400).json({ error: 'Invalid file type' });
    }
    
    // Check file extension matches content type
    const ext = path.extname(file.name).toLowerCase();
    if (!isValidExtensionForType(fileType.mime, ext)) {
      return res.status(400).json({ error: 'File type mismatch' });
    }
  }
  
  next();
};

function isValidExtensionForType(mimeType, ext) {
  const extensionMap = {
    'application/pdf': ['.pdf'],
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/vnd.ms-excel': ['.xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/gif': ['.gif'],
    'image/webp': ['.webp'],
    'model/step': ['.step', '.stp'],
    'model/iges': ['.iges', '.igs'],
    'model/stl': ['.stl'],
    'model/vnd.fbx': ['.fbx']
  };
  
  return extensionMap[mimeType] && extensionMap[mimeType].includes(ext);
}

module.exports = { handleFileTransformations };
```

## Performance Optimization

### Caching Layer for Transformations

```javascript
// express-backend/utils/cacheUtils.js
const NodeCache = require('node-cache');
const fs = require('fs').promises;
const path = require('path');

class CacheManager {
  constructor() {
    this.cache = new NodeCache({ stdTTL: 600, checkperiod: 120 }); // 10 min TTL
    this.cacheDir = process.env.CACHE_DIR || './cache';
  }

  async initialize() {
    await fs.mkdir(this.cacheDir, { recursive: true });
  }

  // Cache transformed file results
  async cacheTransformation(originalPath, transformType, outputPath) {
    const cacheKey = this.generateCacheKey(originalPath, transformType);
    
    // Copy transformed file to cache directory
    const cacheFilePath = path.join(this.cacheDir, `${cacheKey}${path.extname(outputPath)}`);
    await fs.copyFile(outputPath, cacheFilePath);
    
    // Store cache key and path
    this.cache.set(cacheKey, cacheFilePath);
  }

  // Get cached transformation result
  getCachedTransformation(originalPath, transformType) {
    const cacheKey = this.generateCacheKey(originalPath, transformType);
    return this.cache.get(cacheKey);
  }

  // Check if transformation is already cached
  async isTransformationCached(originalPath, transformType) {
    const cachedPath = this.getCachedTransformation(originalPath, transformType);
    if (!cachedPath) return false;
    
    try {
      await fs.access(cachedPath);
      return true;
    } catch {
      // File doesn't exist or not accessible, remove from cache
      this.cache.del(this.generateCacheKey(originalPath, transformType));
      return false;
    }
  }

  // Generate cache key based on original file and transformation type
  generateCacheKey(originalPath, transformType) {
    const crypto = require('crypto');
    const fileHash = crypto.createHash('md5').update(originalPath).digest('hex');
    return `${fileHash}_${transformType}`;
  }

  // Clean expired cache entries
  cleanCache() {
    const keys = this.cache.keys();
    for (const key of keys) {
      const filePath = this.cache.get(key);
      if (filePath) {
        fs.unlink(filePath).catch(() => {}); // Ignore errors
      }
    }
    this.cache.flushAll();
  }
}

module.exports = new CacheManager();
```

This additional planning document addresses the requirement for the ExpressJS backend to perform file transformations and interact with the FileEngine REST proxy for filesystem operations. The design includes:

1. A complete ExpressJS backend architecture with transformation services
2. Integration with LibreOffice/OpenOffice for PDF generation
3. CAD conversion services with XeoKit integration
4. Backend logic for advanced file operations
5. Proper security and validation middleware
6. Caching mechanisms for performance optimization
7. Frontend integration patterns for accessing transformation services
8. Direct integration with FileEngine REST API for filesystem operations

This design ensures that the ExpressJS backend can handle the advanced file transformation requirements mentioned in the original frontend specification while maintaining proper integration with the FileEngine system.