const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow only images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Upload file (with optional authentication for profile pictures)
router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please select a file to upload',
        code: 'NO_FILE'
      });
    }

    // Generate public URL
    const fileUrl = `http://192.168.20.137:3000/uploads/${req.file.filename}`;

    res.json({
      message: 'File uploaded successfully',
      url: fileUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({
      error: 'Upload failed',
      message: 'Failed to upload file',
      code: 'UPLOAD_ERROR'
    });
  }
});

// Upload file with authentication (for other file types)
router.post('/upload-auth', authenticateToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please select a file to upload',
        code: 'NO_FILE'
      });
    }

    // Generate public URL
    const fileUrl = `http://192.168.20.137:3000/uploads/${req.file.filename}`;

    res.json({
      message: 'File uploaded successfully',
      url: fileUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({
      error: 'Upload failed',
      message: 'Failed to upload file',
      code: 'UPLOAD_ERROR'
    });
  }
});

// Get file
router.get('/:fileId', authenticateToken, (req, res) => {
  // TODO: Implement file download
  res.json({ message: 'File download endpoint - to be implemented' });
});

module.exports = router;
