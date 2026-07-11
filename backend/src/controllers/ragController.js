import KbDocument from '../models/KbDocument.js';
import { ingestPDF, queryKnowledgeBase } from '../services/ragService.js';
import { getPineconeIndex } from '../config/pinecone.js';

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

    // ── Check document limit (max 5 per user — PRD §FEAT-02) ────────────────
    const docCount = await KbDocument.countDocuments({ userId: req.user.id });
    if (docCount >= 5) {
      return res.status(400).json({
        success: false,
        error: { code: 'DOC_LIMIT_REACHED', message: 'Maximum 5 documents per user. Delete one before uploading.' }
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

/**
 * listDocuments — GET /api/rag/documents
 * API Spec §GET /api/rag/documents
 *
 * Returns all documents uploaded by the authenticated user.
 * Sorted by uploadedAt descending (newest first).
 * Includes status, chunkCount, and namespace for each document.
 */
export async function listDocuments(req, res, next) {
  try {
    const documents = await KbDocument.find({ userId: req.user.id })
      .sort({ uploadedAt: -1 })
      .lean();

    const formatted = documents.map(doc => ({
      id:                doc._id,
      fileName:          doc.fileName,
      fileSize:          doc.fileSize,
      uploadedAt:        doc.uploadedAt,
      status:            doc.status,
      chunkCount:        doc.chunkCount,
      pineconeNamespace: doc.pineconeNamespace,
      errorMessage:      doc.errorMessage
    }));

    res.status(200).json({
      success:   true,
      documents: formatted,
      count:     formatted.length,
      limit:     5
    });
  } catch (err) {
    next(err);
  }
}

/**
 * getDocument — GET /api/rag/documents/:id
 * API Spec §GET /api/rag/documents/:id
 *
 * Returns a single document by ID. Verifies ownership.
 * Used by the frontend for polling ingestion status (every 2s).
 */
export async function getDocument(req, res, next) {
  try {
    const doc = await KbDocument.findOne({
      _id:    req.params.id,
      userId: req.user.id
    }).lean();

    if (!doc) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Document not found or you do not own it.' }
      });
    }

    res.status(200).json({
      success: true,
      document: {
        id:           doc._id,
        fileName:     doc.fileName,
        fileSize:     doc.fileSize,
        uploadedAt:   doc.uploadedAt,
        status:       doc.status,
        chunkCount:   doc.chunkCount,
        errorMessage: doc.errorMessage
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * deleteDocument — DELETE /api/rag/documents/:id
 * API Spec §DELETE /api/rag/documents/:id
 * DB Schema §Cascade Delete
 *
 * Deletes a document from MongoDB AND its vectors from Pinecone.
 * CRITICAL: Must use namespace('user-${userId}') — never operate on default namespace.
 * Both deletions must succeed; partial delete is not acceptable.
 */
export async function deleteDocument(req, res, next) {
  try {
    // ── Step 1: Find document and verify ownership ──────────────────────────
    const doc = await KbDocument.findOne({
      _id:    req.params.id,
      userId: req.user.id
    });

    if (!doc) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Document not found or you do not own it.' }
      });
    }

    // ── Step 2: Delete vectors from Pinecone ────────────────────────────────
    // CRITICAL: namespace('user-${userId}') — cascade delete DB Schema §Collection 3
    // Only attempt Pinecone cleanup if vectors were actually upserted (chunkCount > 0).
    // Pinecone Serverless does NOT support filter-based deleteMany — we delete by
    // generated vector IDs (pattern from ragService: ${documentId}-chunk-${i}).
    if (doc.chunkCount > 0) {
      try {
        const index     = getPineconeIndex();
        const namespace = index.namespace(`user-${req.user.id}`);

        // Generate vector IDs matching the pattern in ragService.js
        const vectorIds = Array.from(
          { length: doc.chunkCount },
          (_, i) => `${doc._id.toString()}-chunk-${i}`
        );

        // Delete vectors by ID array (Serverless-compatible)
        await namespace.deleteMany({ ids: vectorIds });

        console.log(`[RAG] Deleted ${doc.chunkCount} Pinecone vectors for doc ${doc._id} from namespace user-${req.user.id}`);
      } catch (pineconeErr) {
        console.error(`[RAG] Pinecone delete failed for doc ${doc._id}:`, pineconeErr.message);
        return res.status(500).json({
          success: false,
          error: { code: 'PINECONE_ERROR', message: 'Failed to delete vectors from Pinecone. Document not removed.' }
        });
      }
    } else {
      console.log(`[RAG] Skipping Pinecone cleanup for doc ${doc._id} (chunkCount=0, no vectors to delete)`);
    }

    // ── Step 3: Delete MongoDB record ───────────────────────────────────────
    await KbDocument.findByIdAndDelete(doc._id);

    console.log(`[RAG] Deleted document ${doc._id} ("${doc.fileName}") from MongoDB`);

    res.status(200).json({
      success:    true,
      message:    'Document and associated vectors deleted successfully.',
      documentId: doc._id
    });
  } catch (err) {
    next(err);
  }
}

/**
 * queryDocuments — POST /api/rag/query
 * API Spec §POST /api/rag/query
 * Architecture §5.4
 *
 * Accepts a natural-language query, embeds it, searches Pinecone,
 * passes retrieved context to Gemini, and returns the answer with
 * source citations.
 *
 * Request body: { query: string (min 5), topK?: number (1-10), documentIds?: string[] }
 * Response:     { success, answer, sources[], latencyMs }
 */
export async function queryDocuments(req, res, next) {
  try {
    const { query, topK = 3, documentIds } = req.body;

    // ── Validate query ──────────────────────────────────────────────────────
    if (!query || typeof query !== 'string' || query.trim().length < 5) {
      return res.status(400).json({
        success: false,
        error: { code: 'QUERY_TOO_SHORT', message: 'Query must be at least 5 characters.' }
      });
    }

    // ── Validate topK ───────────────────────────────────────────────────────
    const k = Math.min(Math.max(parseInt(topK, 10) || 3, 1), 10);

    // ── Check user has at least one ready document ──────────────────────────
    const readyCount = await KbDocument.countDocuments({
      userId: req.user.id,
      status: 'ready'
    });

    if (readyCount === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code:    'NO_DOCUMENTS',
          message: 'No documents with status "ready" found. Upload and process a PDF first.'
        }
      });
    }

    // ── Call RAG query pipeline ──────────────────────────────────────────────
    const result = await queryKnowledgeBase(
      query.trim(),
      req.user.id,
      k,
      documentIds || null
    );

    res.status(200).json({
      success:   true,
      answer:    result.answer,
      sources:   result.sources,
      latencyMs: result.latencyMs
    });
  } catch (err) {
    // Handle specific upstream errors
    if (err.message?.includes('Pinecone')) {
      return res.status(500).json({
        success: false,
        error: { code: 'PINECONE_ERROR', message: 'Vector database query failed.' }
      });
    }
    if (err.status === 429 || err.message?.includes('quota')) {
      return res.status(503).json({
        success: false,
        error: { code: 'LLM_UNAVAILABLE', message: 'AI service temporarily unavailable. Please try again later.' }
      });
    }
    next(err);
  }
}
