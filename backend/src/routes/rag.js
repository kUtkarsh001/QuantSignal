import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.js';
import { uploadPDF } from '../controllers/ragController.js';

const router = Router();

// All RAG routes require authentication
router.use(authMiddleware);

// Multer config — store in memory (buffer), max 10MB, PDF only
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },  // 10 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted.'), false);
    }
  }
});

// POST /api/rag/upload — API Spec §POST /api/rag/upload
// multer middleware extracts the file from multipart form data
router.post('/upload', upload.single('file'), uploadPDF);

export default router;
