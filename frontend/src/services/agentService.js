/**
 * agentService.js — Agent analysis API wrappers
 * Architecture §2.3 — Day 17
 *
 * analyzeStock → POST /api/agent/analyze { symbol }
 * getHistory   → GET  /api/agent/history?page=&limit=&symbol=
 * getAnalysis  → GET  /api/agent/history/:id
 */

const API = import.meta.env.VITE_API_URL;

async function request(endpoint, options, token) {
  const res = await fetch(`${API}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options?.headers || {}),
    },
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error?.message || 'Agent request failed.');
  }
  return data;
}

export const agentService = {
  /**
   * analyzeStock — POST /api/agent/analyze
   * Triggers the full 3-agent pipeline (A → B → C).
   * Returns: { analysisId, symbol, agentA, agentB, agentC, chartSnapshot, latencyMs }
   */
  analyzeStock: (symbol, token) =>
    request('/api/agent/analyze', {
      method: 'POST',
      body: JSON.stringify({ symbol }),
    }, token),

  /**
   * getHistory — GET /api/agent/history
   * Returns paginated analysis history.
   */
  getHistory: (token, { page = 1, limit = 10, symbol } = {}) => {
    const params = new URLSearchParams({ page, limit });
    if (symbol) params.set('symbol', symbol);
    return request(`/api/agent/history?${params}`, {}, token);
  },

  /**
   * getAnalysis — GET /api/agent/history/:id
   * Returns a single analysis record.
   */
  getAnalysis: (id, token) =>
    request(`/api/agent/history/${id}`, {}, token),
};
