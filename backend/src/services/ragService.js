import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import KbDocument from '../models/KbDocument.js';
import { getPineconeIndex } from '../config/pinecone.js';

/**
 * ragService.js — RAG Ingestion Pipeline
 * Architecture §5.3 — Steps 1–7
 *
 * Pipeline:
 *   1. Create KbDocument record (status: uploading)
 *   2. Parse PDF buffer → extract raw text via pdfjs-dist (Mozilla PDF.js)
 *   3. Split text into chunks (status: chunking)
 *   4. Generate OpenAI embeddings for each chunk (status: embedding)
 *   5. Upsert vectors to Pinecone in namespace 'user-{userId}'
 *   6. Update KbDocument with chunkCount + status: ready
 *   7. On error → set status: error + error message
 *
 * CRITICAL: Always use namespace('user-${userId}') on Pinecone calls.
 */

// ── OpenAI Embeddings — text-embedding-ada-002 (1536 dims) ───────────────────
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  modelName:    'text-embedding-ada-002'
});

// ── Text Splitter — 1000 chars per chunk, 200 char overlap ───────────────────
const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize:    1000,
  chunkOverlap: 200
});

/**
 * extractTextFromPDF — Uses Mozilla PDF.js (pdfjs-dist) to extract text.
 * More robust than pdf-parse — handles a wider range of PDF formats.
 *
 * @param {Buffer} pdfBuffer  Raw PDF file buffer
 * @returns {Promise<{text: string, numPages: number}>}
 */
async function extractTextFromPDF(pdfBuffer) {
  const uint8Array = new Uint8Array(pdfBuffer);
  const pdf = await getDocument({ data: uint8Array, useSystemFonts: true }).promise;
  const numPages = pdf.numPages;
  const pageTexts = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    pageTexts.push(pageText);
  }

  return { text: pageTexts.join('\n'), numPages };
}

/**
 * ingestPDF — Full pipeline: PDF buffer → Pinecone vectors
 *
 * Runs asynchronously AFTER the HTTP response is sent (202 Accepted).
 * The caller (ragController) fires this and does NOT await it.
 *
 * @param {string} documentId   MongoDB ObjectId of the KbDocument record
 * @param {Buffer} pdfBuffer    Raw PDF file buffer from multer
 * @param {string} userId       User ID from JWT (for Pinecone namespace)
 * @param {string} fileName     Original filename (stored in vector metadata)
 */
export async function ingestPDF(documentId, pdfBuffer, userId, fileName) {
  try {
    // ── Step 2: Parse PDF ───────────────────────────────────────────────────
    const pdfData  = await extractTextFromPDF(pdfBuffer);
    const fullText = pdfData.text;

    if (!fullText || fullText.trim().length === 0) {
      await KbDocument.findByIdAndUpdate(documentId, {
        status: 'error',
        error:  'PDF contains no extractable text (possibly scanned/image-only).'
      });
      return;
    }

    // ── Step 3: Chunk text ──────────────────────────────────────────────────
    await KbDocument.findByIdAndUpdate(documentId, { status: 'chunking' });

    const chunks = await textSplitter.createDocuments(
      [fullText],
      [{ fileName, documentId }]
    );

    if (chunks.length === 0) {
      await KbDocument.findByIdAndUpdate(documentId, {
        status: 'error',
        error:  'Text splitting produced zero chunks.'
      });
      return;
    }

    // ── Step 4: Generate embeddings ─────────────────────────────────────────
    await KbDocument.findByIdAndUpdate(documentId, { status: 'embedding' });

    const chunkTexts = chunks.map(c => c.pageContent);

    // Batch embeddings — OpenAI handles batching internally
    const vectors = await embeddings.embedDocuments(chunkTexts);

    // ── Step 5: Upsert to Pinecone ──────────────────────────────────────────
    // CRITICAL: namespace('user-${userId}') — never upsert without namespace
    const index     = getPineconeIndex();
    const namespace = index.namespace(`user-${userId}`);

    // Build Pinecone records: id, values, metadata
    const pineconeRecords = vectors.map((vec, i) => ({
      id:       `${documentId}-chunk-${i}`,
      values:   vec,
      metadata: {
        documentId:  documentId.toString(),
        fileName:    fileName,
        chunkIndex:  i,
        text:        chunkTexts[i].slice(0, 800),  // Pinecone metadata limit ~40KB
        pageNumber:  estimatePageNumber(i, chunks.length, pdfData.numPages)
      }
    }));

    // Upsert in batches of 100 (Pinecone limit)
    const BATCH_SIZE = 100;
    for (let i = 0; i < pineconeRecords.length; i += BATCH_SIZE) {
      const batch = pineconeRecords.slice(i, i + BATCH_SIZE);
      await namespace.upsert(batch);
    }

    // ── Step 6: Mark as ready ───────────────────────────────────────────────
    await KbDocument.findByIdAndUpdate(documentId, {
      status:     'ready',
      chunkCount: chunks.length
    });

    console.log(`[RAG] Ingested "${fileName}": ${chunks.length} chunks → Pinecone namespace user-${userId}`);

  } catch (err) {
    // ── Step 7: Error handling ─────────────────────────────────────────────
    console.error(`[RAG] Ingestion failed for ${documentId}:`, err.message);
    await KbDocument.findByIdAndUpdate(documentId, {
      status: 'error',
      error:  err.message.slice(0, 500)
    }).catch(() => {}); // Don't throw if DB update also fails
  }
}

/**
 * estimatePageNumber — rough page estimate based on chunk position.
 * Not perfect, but gives users a reasonable citation pointer.
 */
function estimatePageNumber(chunkIndex, totalChunks, totalPages) {
  if (!totalPages || totalPages <= 0) return null;
  return Math.min(Math.ceil(((chunkIndex + 1) / totalChunks) * totalPages), totalPages);
}
