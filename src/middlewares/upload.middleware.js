const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const apiResponse = require('../utils/apiResponse');

// Ensure uploads/temp directory exists
const uploadDir = path.join(process.cwd(), 'uploads', 'temp');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Disk Storage configuration with random hex prefix to prevent collisions
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const randomHex = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `waste_${Date.now()}_${randomHex}${ext}`;
    cb(null, safeName);
  },
});

// Allowed image MIME types and extensions
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext) || !ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    const error = new Error('Format berkas tidak didukung. Harap unggah foto berekstensi JPG, JPEG, PNG, atau WEBP.');
    error.code = 'INVALID_FILE_TYPE';
    return cb(error, false);
  }
  cb(null, true);
};

// Max 5 MB per file
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1,
  },
  fileFilter,
});

/**
 * Express middleware wrapper for single image upload with error handling and sha256 checksum calculation
 */
const uploadWasteImage = (req, res, next) => {
  const singleUpload = upload.single('photo');

  singleUpload(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return apiResponse.error(res, 'Ukuran foto melebihi batas maksimal 5 MB.', 400);
        }
        return apiResponse.error(res, `Gagal mengunggah foto: ${err.message}`, 400);
      }
      return apiResponse.error(res, err.message || 'Gagal memproses unggahan foto.', 400);
    }

    if (!req.file) {
      return apiResponse.error(res, 'Foto sampah wajib diunggah (bidang "photo").', 400);
    }

    // Compute SHA-256 hash for image audit integrity
    try {
      const fileBuffer = fs.readFileSync(req.file.path);
      req.file.sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    } catch (hashErr) {
      req.file.sha256 = null;
    }

    next();
  });
};

/**
 * Helper to safely delete temporary upload files
 */
const cleanupTempFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      // non-blocking
    }
  }
};

module.exports = {
  uploadWasteImage,
  cleanupTempFile,
};
