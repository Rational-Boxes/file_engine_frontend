const express = require('express');
const router = express.Router();
const FileService = require('../services/fileService');

// Get file information
router.get('/info/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    const userId = req.user ? req.user.id : null; // Assuming user is attached by auth middleware
    
    const fileInfo = await FileService.getFileInfo(uid, userId);
    
    res.json({
      success: true,
      data: fileInfo
    });
  } catch (error) {
    console.error('Get file info error:', error);
    res.status(500).json({ error: error.message });
  }
});

// List directory contents
router.get('/dir/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    const userId = req.user ? req.user.id : null; // Assuming user is attached by auth middleware
    
    const directoryContents = await FileService.listDirectory(uid, userId);
    
    res.json({
      success: true,
      data: directoryContents
    });
  } catch (error) {
    console.error('List directory error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;