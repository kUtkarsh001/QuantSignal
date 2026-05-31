import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.js';
import {
  uploadPDF,
  listDocuments,
  getDocument,
  deleteDocument,
  queryDocuments
} from '../controllers/ragController.js';

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

// GET  /api/rag/documents     — API Spec §GET /api/rag/documents (Day 10)
// List all documents for the authenticated user
router.get('/documents', listDocuments);

// GET  /api/rag/documents/:id — API Spec §GET /api/rag/documents/:id (Day 10)
// Poll a single document's ingestion status
router.get('/documents/:id', getDocument);

// DELETE /api/rag/documents/:id — API Spec §DELETE /api/rag/documents/:id (Day 10)
// Delete document from MongoDB AND cascade-delete vectors from Pinecone
router.delete('/documents/:id', deleteDocument);

// POST /api/rag/query — API Spec §POST /api/rag/query (Day 11)
// RAG query: embed → Pinecone search → Gemini answer → return with citations
router.post('/query', queryDocuments);

export default router;
