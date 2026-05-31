import mongoose from 'mongoose';

/**
 * kbdocuments collection — DB Schema §Collection 3
 *
 * Tracks every PDF uploaded by a user for the RAG knowledge base.
 * Each document goes through the pipeline: uploading → chunking → embedding → ready
 *
 * Fields:
 *   userId     — ref to User who uploaded (for namespace isolation)
 *   fileName   — original filename from the upload
 *   fileSize   — bytes, for display and validation
 *   status     — pipeline stage: 'uploading' | 'chunking' | 'embedding' | 'ready' | 'error'
 *   chunkCount — total chunks after splitting (set when status reaches 'ready')
 *   error      — error message if pipeline fails
 *   uploadedAt — timestamp of initial upload
 */
const kbDocumentSchema = new mongoose.Schema({
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    index:    true
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
  error: {
    type:    String,
    default: null
  },
  uploadedAt: {
    type:    Date,
    default: Date.now
  }
});

export default mongoose.model('KbDocument', kbDocumentSchema);
