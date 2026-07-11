/**
 * marketService.js — Market data API wrappers
 * Architecture §2.3
 *
 * fetchQuote     → GET /api/market/quote?symbol=
 * fetchIndicators → GET /api/market/indicators?symbol=
 */

const API = import.meta.env.VITE_API_URL;

async function request(endpoint, token) {
  const res  = await fetch(`${API}${endpoint}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error?.message || 'Market data fetch failed.');
  }
  return data;
}

export const marketService = {
  /**
   * fetchQuote — GET /api/market/quote?symbol=RELIANCE.NS&period=3mo
   * 3mo gives ~62 candles — enough for EMA-26 + signal(9) = 35-candle MACD warmup.
   */
  fetchQuote: (symbol, token) =>
    request(`/api/market/quote?symbol=${encodeURIComponent(symbol)}&period=3mo`, token),

  /**
   * fetchIndicators — GET /api/market/indicators?symbol=RELIANCE.NS&period=3mo
   */
  fetchIndicators: (symbol, token) =>
    request(`/api/market/indicators?symbol=${encodeURIComponent(symbol)}&period=3mo`, token),
};

