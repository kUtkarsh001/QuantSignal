/**
 * HistoryPage.jsx — Paginated analysis history
 * Architecture §2.1 — Day 18
 *
 * Lists all past AI analyses for the logged-in user.
 * Each row shows: symbol, sector, signal, confidence score, date, latency.
 * Clicking a row expands the full AgentResultPanel for that record.
 *
 * Pagination: 10 per page, prev/next controls.
 * Search filter: type a ticker to filter client-side.
 *
 * API: GET /api/agent/history?page=&limit=10
 * Single: GET /api/agent/history/:id  (for expanded detail view)
 */

import { useEffect, useState, useCallback } from 'react';
import { useAuth }       from '../contexts/AuthContext.jsx';
import { agentService }  from '../services/agentService.js';
import AgentResultPanel  from '../components/AgentResultPanel.jsx';
import ConfidenceGauge   from '../components/ConfidenceGauge.jsx';
import styles            from './HistoryPage.module.css';

// ── Signal pill ──────────────────────────────────────────────────────────────
function TrendPill({ trend }) {
  const map = {
    bullish: { color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', icon: '▲' },
    bearish: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  icon: '▼' },
    neutral: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', icon: '◆' },
  };
  const s = map[trend] || map.neutral;
  return (
    <span className={styles.pill} style={{ color: s.color, background: s.bg, borderColor: s.border }}>
      {s.icon} {trend?.toUpperCase() || 'N/A'}
    </span>
  );
}

// ── Skeleton loader ──────────────────────────────────────────────────────────
function RowSkeleton() {
  return (
    <div className={styles.skeletonRow}>
      {[...Array(5)].map((_, i) => (
        <div key={i} className={styles.skeletonCell} />
      ))}
    </div>
  );
}

// ── Expanded detail modal ────────────────────────────────────────────────────
function DetailDrawer({ id, token, onClose }) {
  const [record, setRecord]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    agentService.getAnalysis(id, token)
      .then(res => setRecord(res.data ?? res))
      .catch(e  => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, token]);

  return (
    <div className={styles.drawerOverlay} onClick={onClose}>
      <div className={styles.drawer} onClick={e => e.stopPropagation()}>
        <div className={styles.drawerHeader}>
          <span className={styles.drawerTitle}>Analysis Detail</span>
          <button id="close-drawer" className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.drawerBody}>
          {loading && <p className={styles.drawerLoading}>Loading…</p>}
          {error   && <p className={styles.drawerError}>⚠️ {error}</p>}
          {record  && <AgentResultPanel result={record} />}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function HistoryPage() {
  const { token } = useAuth();

  const [items,    setItems]    = useState([]);
  const [page,     setPage]     = useState(1);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [filter,   setFilter]   = useState('');
  const [selected, setSelected] = useState(null); // expanded row id

  const LIMIT = 10;
  const totalPages = Math.ceil(total / LIMIT);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    setError('');
    try {
      const res = await agentService.getHistory(token, { page: p, limit: LIMIT });
      const d   = res.data;
      setItems(d.items ?? []);
      setTotal(d.pagination?.total ?? 0);
      setPage(p);
    } catch (e) {
      setError(e.message || 'Failed to load history.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(1); }, [load]);

  // Client-side filter by ticker
  const filtered = items.filter(r =>
    !filter || r.symbol?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Analysis History</h1>
          <p className={styles.sub}>
            {total} total {total === 1 ? 'analysis' : 'analyses'} · page {page} of {Math.max(totalPages, 1)}
          </p>
        </div>
        <input
          id="history-filter"
          className={styles.filterInput}
          placeholder="Filter by ticker…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>

      {/* Error */}
      {error && <div className={styles.errorBanner}>⚠️ {error}</div>}

      {/* Table */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Sector</th>
              <th>Signal</th>
              <th className={styles.thCenter}>Confidence</th>
              <th>Date</th>
              <th className={styles.thRight}>Latency</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? [...Array(5)].map((_, i) => <tr key={i}><td colSpan={6}><RowSkeleton /></td></tr>)
              : filtered.length === 0
                ? (
                  <tr>
                    <td colSpan={6} className={styles.emptyCell}>
                      {filter ? `No results for "${filter}"` : 'No analyses yet — run your first one on the Dashboard!'}
                    </td>
                  </tr>
                )
                : filtered.map(row => (
                  <tr
                    key={row._id}
                    id={`history-row-${row._id}`}
                    className={`${styles.row} ${selected === row._id ? styles.rowActive : ''}`}
                    onClick={() => setSelected(row._id)}
                  >
                    <td>
                      <span className={styles.symbolCell}>{row.symbol}</span>
                    </td>
                    <td className={styles.sectorCell}>{row.sector || '—'}</td>
                    <td>
                      <TrendPill trend={row.agentA?.trend ?? 'neutral'} />
                    </td>
                    <td className={styles.tdCenter}>
                      <span
                        className={styles.score}
                        style={{
                          color: row.agentC?.confidenceScore >= 70 ? '#10b981'
                               : row.agentC?.confidenceScore >= 40 ? '#f59e0b'
                               : '#ef4444'
                        }}
                      >
                        {row.agentC?.confidenceScore ?? '—'}
                      </span>
                    </td>
                    <td className={styles.dateCell}>
                      {new Date(row.timestamp).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                    <td className={styles.tdRight}>
                      <span className={styles.latency}>
                        {row.latencyMs ? (row.latencyMs / 1000).toFixed(1) + 's' : '—'}
                      </span>
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            id="history-prev"
            className={styles.pageBtn}
            disabled={page <= 1 || loading}
            onClick={() => load(page - 1)}
          >
            ← Prev
          </button>
          <span className={styles.pageInfo}>
            {page} / {totalPages}
          </span>
          <button
            id="history-next"
            className={styles.pageBtn}
            disabled={page >= totalPages || loading}
            onClick={() => load(page + 1)}
          >
            Next →
          </button>
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <DetailDrawer
          id={selected}
          token={token}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
