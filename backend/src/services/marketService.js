import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  computeSMA,
  computeEMA,
  computeRSI,
  computeMACD,
  computeBollinger
} from '../dsp/filters.js';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// In-memory cache: key = `${symbol}-${period}-${interval}`, value = { data, cachedAt }
const cache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

/**
 * fetchStockData — spawns fetch_stock.py as a child process.
 * Architecture §3.4
 *
 * The Python script prints a single JSON object to stdout, then exits.
 * This function captures stdout, parses the JSON, and resolves the promise.
 *
 * @param {string} symbol   Yahoo Finance ticker (e.g. 'RELIANCE.NS', 'AAPL')
 * @param {string} period   History range — '1d'|'5d'|'1mo'|'3mo'|'6mo'|'1y'  (default: '1mo')
 * @param {string} interval Candle size  — '1m'|'5m'|'15m'|'1h'|'1d'|'1wk'   (default: '1d')
 * @returns {Promise<object>} Parsed stock data object
 */
export function fetchStockData(symbol, period = '1mo', interval = '1d') {
  const cacheKey = `${symbol}-${period}-${interval}`;

  // ── Return cached data if still fresh ────────────────────────────────────────
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return Promise.resolve({ ...cached.data, fromCache: true });
    }
  }

  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(__dirname, '../../python/fetch_stock.py');

    // Try python3 first, fallback to python (Render may only have 'python')
    const candidates = process.platform === 'win32' ? ['python'] : ['python3', 'python'];

    function trySpawn(cmdIndex) {
      if (cmdIndex >= candidates.length) {
        return reject(new Error('No Python interpreter found. Tried: ' + candidates.join(', ')));
      }

      const pythonCmd = candidates[cmdIndex];
      console.log(`[marketService] Spawning: ${pythonCmd} ${scriptPath} ${symbol} ${period} ${interval}`);
      const child = spawn(pythonCmd, [scriptPath, symbol, period, interval]);

      let output      = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => { output += data.toString(); });
      child.stderr.on('data', (data) => { errorOutput += data.toString(); });

      child.on('close', (code) => {
        if (code !== 0) {
          console.error(`[marketService] ${pythonCmd} exited with code ${code}. stderr: ${errorOutput.slice(0, 500)}. stdout: ${output.slice(0, 500)}`);
          // Python script prints errors as JSON to stdout, not stderr.
          try {
            const parsed = JSON.parse(output);
            if (parsed.error) return reject(new Error(parsed.error));
          } catch { /* ignore */ }
          return reject(new Error(`Python process exited with code ${code}: ${errorOutput || output.slice(0, 300)}`));
        }
        try {
          const parsed = JSON.parse(output);
          if (parsed.error) {
            return reject(new Error(parsed.error));
          }
          const cachedAt = Date.now();
          cache.set(cacheKey, { data: { ...parsed, cachedAt: new Date(cachedAt).toISOString() }, cachedAt });
          resolve({ ...parsed, cachedAt: new Date(cachedAt).toISOString() });
        } catch {
          reject(new Error(`Failed to parse Python output: ${output.slice(0, 200)}`));
        }
      });

      child.on('error', (err) => {
        console.error(`[marketService] Failed to spawn '${pythonCmd}': ${err.message}`);
        // ENOENT means command not found — try next candidate
        if (err.code === 'ENOENT') {
          trySpawn(cmdIndex + 1);
        } else {
          reject(new Error(`Failed to spawn Python process: ${err.message}`));
        }
      });
    }

    trySpawn(0);
  });
}

/**
 * getEnrichedData — single-call helper for agentController.js
 *
 * Fetches 1-month daily OHLCV data then runs all DSP filters.
 * Returns a clean object with candles, sector, and all indicator arrays
 * so agentController can extract the latest values for Agent A's prompt.
 *
 * @param {string} symbol  Yahoo Finance ticker (e.g. 'RELIANCE.NS', 'AAPL')
 * @returns {Promise<{candles, sector, indicators}>}
 */
export async function getEnrichedData(symbol) {
  const data   = await fetchStockData(symbol, '1mo', '1d');
  const closes = data.candles.map(c => c.close);

  const sma20     = computeSMA(closes, 20);
  const ema12     = computeEMA(closes, 12);
  const ema26     = computeEMA(closes, 26);
  const rsi14     = computeRSI(closes, 14);
  const macd      = computeMACD(closes);
  const bollinger = computeBollinger(closes, 20);

  return {
    candles: data.candles,
    sector:  data.sector ?? 'Unknown',
    indicators: {
      sma20,
      ema12,
      ema26,
      rsi14,
      macdHistogram: macd.histogram,
      bollinger
    }
  };
}
