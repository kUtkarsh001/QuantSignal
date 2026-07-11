/**
 * KnowledgeBasePage.jsx — PDF upload + RAG chat
 * Architecture §2.1 — Day 19
 *
 * Sections:
 *   1. Upload zone  — drag-and-drop / click PDF upload (max 10MB, max 5 docs)
 *   2. Document list — status pills with polling (uploading → chunking → embedding → ready/error)
 *   3. RAG chat     — ask questions about uploaded documents, shows citations
 *
 * Backend API:
 *   POST   /api/rag/upload
 *   GET    /api/rag/documents
 *   GET    /api/rag/documents/:id  (status poll every 2s)
 *   DELETE /api/rag/documents/:id
 *   POST   /api/rag/query
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth }     from '../contexts/AuthContext.jsx';
import { ragService }  from '../services/ragService.js';
import styles          from './KnowledgeBasePage.module.css';

const STATUS_META = {
  uploading:  { label: 'Uploading',  color: '#f59e0b', pulse: true  },
  chunking:   { label: 'Chunking',   color: '#60a5fa', pulse: true  },
  embedding:  { label: 'Embedding',  color: '#a78bfa', pulse: true  },
  ready:      { label: 'Ready',      color: '#10b981', pulse: false },
  error:      { label: 'Error',      color: '#ef4444', pulse: false },
};

function fmt(bytes) {
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  return (bytes / 1e3).toFixed(0) + ' KB';
}

// ── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ status }) {
  const m = STATUS_META[status] || { label: status, color: '#94a3b8', pulse: false };
  return (
    <span
      className={`${styles.pill} ${m.pulse ? styles.pillPulse : ''}`}
      style={{ color: m.color, borderColor: `${m.color}40`, background: `${m.color}15` }}
    >
      {m.pulse && <span className={styles.dot} style={{ background: m.color }} />}
      {m.label}
    </span>
  );
}

// ── Document row with status polling ────────────────────────────────────────
function DocRow({ doc: initialDoc, token, onDelete, onStatusChange }) {
  const [doc, setDoc]     = useState(initialDoc);
  const [deleting, setDeleting] = useState(false);
  const intervalRef = useRef(null);

  // Poll until status is ready or error
  useEffect(() => {
    if (doc.status === 'ready' || doc.status === 'error') return;

    intervalRef.current = setInterval(async () => {
      try {
        const res = await ragService.getDocument(doc.id, token);
        const updated = res.document;
        setDoc(prev => ({ ...prev, ...updated }));
        if (onStatusChange) onStatusChange(updated);
        if (updated.status === 'ready' || updated.status === 'error') {
          clearInterval(intervalRef.current);
        }
      } catch { /* silently retry */ }
    }, 2000);

    return () => clearInterval(intervalRef.current);
  }, [doc.id, doc.status, token]);

  async function handleDelete() {
    if (!window.confirm(`Delete "${doc.fileName}"? This will remove all its vectors from the knowledge base.`)) return;
    setDeleting(true);
    try {
      await ragService.deleteDocument(doc.id, token);
      onDelete(doc.id);
    } catch (e) {
      alert(`Delete failed: ${e.message}`);
      setDeleting(false);
    }
  }

  return (
    <div className={styles.docRow}>
      <div className={styles.docIcon}>📄</div>
      <div className={styles.docInfo}>
        <span className={styles.docName}>{doc.fileName}</span>
        <span className={styles.docMeta}>
          {fmt(doc.fileSize)}
          {doc.chunkCount > 0 && ` · ${doc.chunkCount} chunks`}
          {doc.status === 'error' && doc.errorMessage && ` · ${doc.errorMessage}`}
        </span>
      </div>
      <StatusPill status={doc.status} />
      <button
        id={`delete-doc-${doc.id}`}
        className={styles.deleteBtn}
        onClick={handleDelete}
        disabled={deleting || doc.status === 'uploading' || doc.status === 'embedding'}
        title="Delete document"
      >
        {deleting ? '…' : '✕'}
      </button>
    </div>
  );
}

// ── Chat message ─────────────────────────────────────────────────────────────
function ChatBubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAI}`}>
      <div className={styles.bubbleContent}>{msg.content}</div>
      {msg.sources?.length > 0 && (
        <div className={styles.sources}>
          {msg.sources.map((s, i) => (
            <span key={i} className={styles.sourceTag}>
              📎 {s.fileName} {s.page ? `· p.${s.page}` : ''}
            </span>
          ))}
        </div>
      )}
      {msg.latencyMs != null && (
        <div className={styles.bubbleLatency}>{(msg.latencyMs / 1000).toFixed(1)}s</div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function KnowledgeBasePage() {
  const { token } = useAuth();

  // Documents
  const [docs,         setDocs]         = useState([]);
  const [docsLoading,  setDocsLoading]  = useState(true);
  const [docsError,    setDocsError]    = useState('');

  // Upload
  const [uploading,    setUploading]    = useState(false);
  const [uploadError,  setUploadError]  = useState('');
  const [dragOver,     setDragOver]     = useState(false);
  const fileInputRef = useRef(null);

  // Chat
  const [messages,  setMessages]  = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [querying,  setQuerying]  = useState(false);
  const [chatError, setChatError] = useState('');
  const chatEndRef = useRef(null);

  // Load documents on mount
  const loadDocs = useCallback(async () => {
    setDocsLoading(true);
    setDocsError('');
    try {
      const res = await ragService.listDocuments(token);
      setDocs(res.documents || []);
    } catch (e) {
      setDocsError(e.message);
    } finally {
      setDocsLoading(false);
    }
  }, [token]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle file upload
  async function handleUpload(file) {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setUploadError('Only PDF files are accepted.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File is too large. Maximum size is 10 MB.');
      return;
    }
    if (docs.length >= 5) {
      setUploadError('Maximum 5 documents. Delete one before uploading.');
      return;
    }

    setUploading(true);
    setUploadError('');
    try {
      const res = await ragService.uploadPDF(file, token);
      // Add optimistically with 'uploading' status
      setDocs(prev => [{
        id:        res.data.documentId,
        fileName:  res.data.fileName,
        fileSize:  file.size,
        status:    'uploading',
        chunkCount:0,
      }, ...prev]);
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  }

  function handleFileInput(e) {
    handleUpload(e.target.files[0]);
    e.target.value = '';
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files[0]);
  }

  function handleDeleteDoc(id) {
    setDocs(prev => prev.filter(d => d.id !== id));
  }

  function handleStatusChange(updatedDoc) {
    setDocs(prev => prev.map(d => d.id === updatedDoc.id ? { ...d, ...updatedDoc } : d));
  }

  // RAG chat query
  async function handleQuery(e) {
    e.preventDefault();
    const q = chatInput.trim();
    if (!q || querying) return;

    const readyDocs = docs.filter(d => d.status === 'ready');
    if (readyDocs.length === 0) {
      setChatError('Upload and process at least one PDF before querying.');
      return;
    }

    setChatInput('');
    setChatError('');
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setQuerying(true);

    try {
      const res = await ragService.queryDocuments(q, token);
      setMessages(prev => [...prev, {
        role:      'ai',
        content:   res.answer,
        sources:   res.sources,
        latencyMs: res.latencyMs,
      }]);
    } catch (e) {
      setChatError(e.message);
    } finally {
      setQuerying(false);
    }
  }

  const readyCount = docs.filter(d => d.status === 'ready').length;

  return (
    <div className={styles.page}>
      {/* ── Page header ── */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Knowledge Base</h1>
          <p className={styles.sub}>
            Upload sector reports and macro PDFs to power Agent B's sentiment analysis
          </p>
        </div>
        <div className={styles.docCount}>
          <span className={styles.docCountNum}>{docs.length}</span>
          <span className={styles.docCountLabel}>/ 5 docs</span>
        </div>
      </div>

      <div className={styles.layout}>
        {/* ── Left: Upload + Documents ── */}
        <div className={styles.leftCol}>
          {/* Drop zone */}
          <div
            id="upload-dropzone"
            className={`${styles.dropzone} ${dragOver ? styles.dropzoneActive : ''} ${uploading ? styles.dropzoneUploading : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              id="pdf-file-input"
              type="file"
              accept=".pdf,application/pdf"
              className={styles.fileInput}
              onChange={handleFileInput}
            />
            <div className={styles.dropzoneIcon}>
              {uploading ? <span className={styles.spinner} /> : '📁'}
            </div>
            <div className={styles.dropzoneText}>
              {uploading
                ? 'Uploading…'
                : dragOver
                  ? 'Drop PDF here'
                  : 'Drop PDF here or click to browse'}
            </div>
            <div className={styles.dropzoneSub}>PDF only · Max 10 MB · Max 5 documents</div>
          </div>

          {uploadError && (
            <div className={styles.errorBanner}>⚠️ {uploadError}</div>
          )}

          {/* Document list */}
          <div className={styles.docList}>
            <div className={styles.docListHeader}>
              <span>Documents</span>
              {readyCount > 0 && (
                <span className={styles.readyBadge}>✓ {readyCount} ready</span>
              )}
            </div>

            {docsLoading && (
              <div className={styles.docLoading}>Loading…</div>
            )}
            {docsError && (
              <div className={styles.errorBanner}>⚠️ {docsError}</div>
            )}
            {!docsLoading && docs.length === 0 && (
              <div className={styles.docEmpty}>
                No documents yet. Upload a PDF to get started.
              </div>
            )}
            {docs.map(doc => (
              <DocRow
                key={doc.id}
                doc={doc}
                token={token}
                onDelete={handleDeleteDoc}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        </div>

        {/* ── Right: RAG chat ── */}
        <div className={styles.rightCol}>
          <div className={styles.chatHeader}>
            <span className={styles.chatTitle}>💬 Ask your documents</span>
            {readyCount === 0 && (
              <span className={styles.chatDisabledHint}>
                Upload a PDF to start chatting
              </span>
            )}
          </div>

          <div className={styles.chatMessages}>
            {messages.length === 0 && (
              <div className={styles.chatEmpty}>
                <div className={styles.chatEmptyIcon}>🤖</div>
                <div>Ask anything about your uploaded documents.</div>
                <div className={styles.chatEmptyExamples}>
                  <span>"What is the RBI's stance on interest rates?"</span>
                  <span>"Summarise the key macro risks mentioned."</span>
                  <span>"Which sectors are highlighted as outperformers?"</span>
                </div>
              </div>
            )}
            {messages.map((m, i) => <ChatBubble key={i} msg={m} />)}
            {querying && (
              <div className={`${styles.bubble} ${styles.bubbleAI}`}>
                <div className={styles.thinkingDots}>
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {chatError && (
            <div className={styles.chatError}>⚠️ {chatError}</div>
          )}

          <form className={styles.chatForm} onSubmit={handleQuery}>
            <input
              id="rag-chat-input"
              className={styles.chatInput}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder={readyCount > 0 ? 'Ask about your documents…' : 'Upload a PDF to enable chat'}
              disabled={querying || readyCount === 0}
            />
            <button
              id="rag-chat-send"
              type="submit"
              className={styles.sendBtn}
              disabled={querying || !chatInput.trim() || readyCount === 0}
            >
              {querying ? <span className={styles.spinner} /> : '↑'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
