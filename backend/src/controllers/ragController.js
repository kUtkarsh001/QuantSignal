import KbDocument from '../models/KbDocument.js';
import { ingestPDF } from '../services/ragService.js';

/**
 * uploadPDF — POST /api/rag/upload
 * API Spec §POST /api/rag/upload
 *
 * Accepts a multipart file upload (PDF only, max 10MB).
 * Immediately returns 202 with the document record.
 * Fires the ingest pipeline asynchronously — does NOT await it.
 * Frontend polls GET /api/rag/documents/:id to track status.
 */
export async function uploadPDF(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'No PDF file provided. Use multipart form field "file".' }
      });
    }

    // Validate file type
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_FILE_TYPE', message: 'Only PDF files are accepted.' }
      });
    }

    // ── Step 1: Create KbDocument record (status: uploading) ─────────────────
    const doc = await KbDocument.create({
      userId:   req.user.id,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      status:   'uploading'
    });

    // ── Fire async pipeline — DO NOT await ───────────────────────────────────
    // This runs in the background. The HTTP response returns immediately.
    ingestPDF(doc._id, req.file.buffer, req.user.id, req.file.originalname);

    // ── Return 202 Accepted immediately ─────────────────────────────────────
    res.status(202).json({
      success: true,
      data: {
        documentId: doc._id,
        fileName:   doc.fileName,
        status:     doc.status,
        message:    'PDF upload accepted. Poll GET /api/rag/documents/:id for status.'
      }
    });
  } catch (err) {
    next(err);
  }
}
