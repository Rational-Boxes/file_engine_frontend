const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const TransformService = require('../services/transformService');

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