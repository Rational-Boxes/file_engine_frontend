const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
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