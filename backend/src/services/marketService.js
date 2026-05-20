import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

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

    // Spawn Python child process — Architecture §3.4
    // Windows uses 'python', Linux/Mac use 'python3'
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const child = spawn(pythonCmd, [scriptPath, symbol, period, interval]);

    let output      = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => { output += data.toString(); });
    child.stderr.on('data', (data) => { errorOutput += data.toString(); });

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Python process exited with code ${code}: ${errorOutput}`));
      }
      try {
        const parsed = JSON.parse(output);
        if (parsed.error) {
          return reject(new Error(parsed.error));
        }
        // Store in cache with timestamp
        const cachedAt = Date.now();
        cache.set(cacheKey, { data: { ...parsed, cachedAt: new Date(cachedAt).toISOString() }, cachedAt });
        resolve({ ...parsed, cachedAt: new Date(cachedAt).toISOString() });
      } catch {
        reject(new Error(`Failed to parse Python output: ${output.slice(0, 200)}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn Python process: ${err.message}`));
    });
  });
}
