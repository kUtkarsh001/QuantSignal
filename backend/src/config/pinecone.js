import { Pinecone } from '@pinecone-database/pinecone';

/**
 * pinecone.js — Pinecone client initialisation
 * Architecture §9.0
 *
 * Exports:
 *   pineconeClient  — raw Pinecone instance (use for index.describe(), etc.)
 *   getPineconeIndex — returns the quantsignal index handle for upsert/query/delete
 *
 * CRITICAL: Always call .namespace('user-${userId}') on the returned index handle.
 * Never upsert or query without a namespace — vectors will be orphaned silently.
 *
 * Usage:
 *   import { getPineconeIndex } from '../config/pinecone.js';
 *   const index = getPineconeIndex();
 *   await index.namespace(`user-${req.user.id}`).upsert([...]);
 */

if (!process.env.PINECONE_API_KEY) {
  throw new Error('PINECONE_API_KEY is not set in environment variables.');
}
if (!process.env.PINECONE_INDEX_NAME) {
  throw new Error('PINECONE_INDEX_NAME is not set in environment variables.');
}

// Singleton client — created once, reused across all requests
const pineconeClient = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
});

/**
 * getPineconeIndex — returns the index handle for quantsignal.
 * Lightweight — no network call. Pinecone SDK is lazy.
 * @returns {import('@pinecone-database/pinecone').Index}
 */
function getPineconeIndex() {
  return pineconeClient.index(process.env.PINECONE_INDEX_NAME);
}

export { pineconeClient, getPineconeIndex };
