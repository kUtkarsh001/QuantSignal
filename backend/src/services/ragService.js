import { OpenAIEmbeddings } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
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

// ── NVIDIA Embeddings — nv-embedqa-e5-v5 (1024 dims) ────────────────────────
// Using OpenAI API client pointing to NVIDIA NIM (OpenAI-compatible)
// We intercept fetch to inject the required "input_type" parameter
const createEmbeddings = (inputType) => new OpenAIEmbeddings({
  openAIApiKey: process.env.NVIDIA_API_KEY,
  configuration: {
    baseURL: "https://integrate.api.nvidia.com/v1",
    fetch: async (url, options) => {
      if (options.body) {
        const body = JSON.parse(options.body);
        body.input_type = inputType;
        options.body = JSON.stringify(body);
      }
      return fetch(url, options);
    }
  },
  modelName: "nvidia/nv-embedqa-e5-v5"
});

const documentEmbeddings = createEmbeddings("passage");
const queryEmbeddings    = createEmbeddings("query");

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
        status:       'error',
        errorMessage: 'PDF contains no extractable text (possibly scanned/image-only).'
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
        status:       'error',
        errorMessage: 'Text splitting produced zero chunks.'
      });
      return;
    }

    // ── Step 4: Generate embeddings ─────────────────────────────────────────
    await KbDocument.findByIdAndUpdate(documentId, { status: 'embedding' });

    const chunkTexts = chunks.map(c => c.pageContent);

    // Batch embeddings — OpenAI handles batching internally
    const vectors = await documentEmbeddings.embedDocuments(chunkTexts);
    console.log('[DEBUG] Vectors length:', vectors?.length, 'First vector is array?', Array.isArray(vectors?.[0]));

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
      const records = pineconeRecords.slice(i, i + BATCH_SIZE);
      if (records.length > 0) {
        // Pinecone v7 SDK requires { records } object, not an array
        await namespace.upsert({ records });
      }
    }

    // ── Step 6: Mark as ready ───────────────────────────────────────────────
    await KbDocument.findByIdAndUpdate(documentId, {
      status:            'ready',
      chunkCount:        chunks.length,
      pineconeNamespace: `user-${userId}`
    });

    console.log(`[RAG] Ingested "${fileName}": ${chunks.length} chunks → Pinecone namespace user-${userId}`);

  } catch (err) {
    // ── Step 7: Error handling ─────────────────────────────────────────────
    console.error(`[RAG] Ingestion failed for ${documentId}:`, err.message);
    await KbDocument.findByIdAndUpdate(documentId, {
      status:       'error',
      errorMessage: err.message.slice(0, 500)
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

// ── Gemini LLM — gemini-1.5-flash for RAG Q&A ───────────────────────────────
const llm = new ChatGoogleGenerativeAI({
  apiKey:      process.env.GEMINI_API_KEY,
  model:       'gemini-2.5-flash',
  temperature: 0.3,       // Low temp for factual answers
  maxOutputTokens: 1024
});

/**
 * queryKnowledgeBase — RAG Query Pipeline
 * Architecture §5.4
 *
 * Steps:
 *   1. Embed user query using OpenAI text-embedding-ada-002
 *   2. Search Pinecone namespace('user-{userId}') with topK nearest neighbours
 *   3. Format retrieved chunks with [Source: FileName, Page X] headers
 *   4. Pass context + query to Google Gemini LLM
 *   5. Return { answer, sources, latencyMs }
 *
 * CRITICAL: Always use namespace('user-${userId}') — never query default namespace.
 *
 * @param {string}   query        User's question (min 5 chars)
 * @param {string}   userId       User ID from JWT (for Pinecone namespace)
 * @param {number}   topK         Number of nearest neighbours (1-10, default 3)
 * @param {string[]} documentIds  Optional filter to specific documents
 * @returns {Promise<{answer: string, sources: Array, latencyMs: number}>}
 */
export async function queryKnowledgeBase(query, userId, topK = 3, documentIds = null) {
  const startTime = Date.now();

  // ── Step 1: Embed the user query ────────────────────────────────────────
  const queryVector = await queryEmbeddings.embedQuery(query);

  // ── Step 2: Query Pinecone ──────────────────────────────────────────────
  // CRITICAL: namespace('user-${userId}') — never query without namespace
  const index     = getPineconeIndex();
  const namespace = index.namespace(`user-${userId}`);

  const queryOptions = {
    vector:          queryVector,
    topK:            topK,
    includeMetadata: true
  };

  // Optional: filter to specific documents if documentIds provided
  if (documentIds && documentIds.length > 0) {
    queryOptions.filter = {
      documentId: { $in: documentIds }
    };
  }

  const queryResult = await namespace.query(queryOptions);

  // ── Step 3: Format context with source citations ────────────────────────
  const matches = queryResult.matches || [];

  if (matches.length === 0) {
    return {
      answer:    'No relevant information found in your uploaded documents for this query.',
      sources:   [],
      latencyMs: Date.now() - startTime
    };
  }

  // Build source objects and formatted context
  const sources = [];
  const contextParts = [];

  for (const match of matches) {
    const meta = match.metadata || {};
    const source = {
      documentId: meta.documentId || null,
      fileName:   meta.fileName   || 'Unknown',
      pageNumber: meta.pageNumber || null,
      excerpt:    (meta.text || '').slice(0, 300)
    };
    sources.push(source);

    // Format each chunk with citation header for the LLM
    const pageInfo = meta.pageNumber ? `, Page ${meta.pageNumber}` : '';
    contextParts.push(
      `[Source: ${meta.fileName || 'Unknown'}${pageInfo}]\n${meta.text || ''}`
    );
  }

  const formattedContext = contextParts.join('\n\n---\n\n');

  // ── Step 4: Pass to Gemini LLM ──────────────────────────────────────────
  const systemPrompt = `You are a financial research assistant. Answer the user's question based ONLY on the provided document excerpts. Always cite your sources using inline citations in the format [FileName, Page X]. If the documents do not contain relevant information, say so clearly. Be concise and factual.`;

  const userPrompt = `Document Context:\n${formattedContext}\n\n---\n\nUser Question: ${query}`;

  const response = await llm.invoke([
    { role: 'system', content: systemPrompt },
    { role: 'human',  content: userPrompt }
  ]);

  const answer = response.content || 'Unable to generate an answer.';

  // ── Step 5: Return result ───────────────────────────────────────────────
  return {
    answer,
    sources,
    latencyMs: Date.now() - startTime
  };
}
