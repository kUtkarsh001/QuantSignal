/**
 * ragService.js (frontend) — RAG API wrappers
 * Architecture §2.3 — Day 19
 *
 * uploadPDF      → POST /api/rag/upload         (multipart)
 * listDocuments  → GET  /api/rag/documents
 * getDocument    → GET  /api/rag/documents/:id  (poll status)
 * deleteDocument → DELETE /api/rag/documents/:id
 * queryDocuments → POST /api/rag/query
 */

const API = import.meta.env.VITE_API_URL;

async function jsonRequest(endpoint, options, token) {
  const res = await fetch(`${API}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      ...(options?.headers || {}),
    },
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message || 'RAG request failed.');
  return data;
}

export const ragService = {
  /** Upload a PDF (multipart/form-data) */
  uploadPDF: (file, token) => {
    const form = new FormData();
    form.append('file', file);
    return jsonRequest('/api/rag/upload', { method: 'POST', body: form }, token);
  },

  /** List all documents for user */
  listDocuments: (token) =>
    jsonRequest('/api/rag/documents', {}, token),

  /** Poll a single document's ingestion status */
  getDocument: (id, token) =>
    jsonRequest(`/api/rag/documents/${id}`, {}, token),

  /** Delete a document (DB + Pinecone vectors) */
  deleteDocument: (id, token) =>
    jsonRequest(`/api/rag/documents/${id}`, { method: 'DELETE' }, token),

  /** Query the knowledge base (RAG chat) */
  queryDocuments: (query, token, topK = 3) =>
    jsonRequest('/api/rag/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, topK }),
    }, token),
};
