import mongoose from 'mongoose';

/**
 * kbdocuments collection — DB Schema §Collection 3
 *
 * Tracks every PDF uploaded by a user for the RAG knowledge base.
 * Each document goes through the pipeline: uploading → chunking → embedding → ready
 *
 * Fields:
 *   userId           — ref to User who uploaded (for namespace isolation)
 *   fileName         — original filename from the upload
 *   fileSize         — bytes, for display and validation
 *   status           — pipeline stage: 'uploading' | 'chunking' | 'embedding' | 'ready' | 'error'
 *   chunkCount       — total chunks after splitting (set when status reaches 'ready')
 *   pineconeNamespace — Pinecone namespace where vectors are stored (format: 'user-{userId}')
 *   errorMessage     — error message if pipeline fails
 *   uploadedAt       — timestamp of initial upload
 *
 * Index: { userId: 1, uploadedAt: -1 }
 */
const kbDocumentSchema = new mongoose.Schema({
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true
  },
  fileName: {
    type:     String,
    required: [true, 'File name is required'],
    trim:     true
  },
  fileSize: {
    type:    Number,
    default: 0
  },
  status: {
    type:    String,
    enum:    ['uploading', 'chunking', 'embedding', 'ready', 'error'],
    default: 'uploading'
  },
  chunkCount: {
    type:    Number,
    default: 0
  },
  pineconeNamespace: {
    type:    String,
    default: null
  },
  errorMessage: {
    type:    String,
    default: null
  },
  uploadedAt: {
    type:    Date,
    default: Date.now
  }
});

// Compound index for listing documents by user, newest first
kbDocumentSchema.index({ userId: 1, uploadedAt: -1 });

export default mongoose.model('KbDocument', kbDocumentSchema);
