/**
 * dsp/filters.js — Digital Signal Processing Filters
 * Architecture §4
 *
 * ECE Interview Analogies:
 *   SMA  → N-tap FIR filter with uniform coefficients (h[n] = 1/N for all n)
 *   EMA  → First-order IIR filter (y[n] = k·x[n] + (1-k)·y[n-1]), k = 2/(N+1)
 *   RSI  → Signal energy ratio: avg_gain / (avg_gain + avg_loss) × 100
 *   MACD → Difference of two EMA filters: EMA(12) − EMA(26)
 *   Bollinger → SMA(20) ± 2σ (mean ± 2 standard deviations)
 *
 * All functions:
 *   - Accept a prices array (closing prices, newest at the END)
 *   - Return an array of the same length as the input
 *   - Pad the warm-up period with null values (not zeros, not undefined)
 *   - Use only ESM exports
 */

// ── SMA — Simple Moving Average ───────────────────────────────────────────────
/**
 * computeSMA — N-tap FIR filter with uniform coefficients.
 *
 * For each index i:
 *   - If i < period-1  → null  (not enough history yet)
 *   - Otherwise        → average of prices[i-period+1 .. i]
 *
 * @param {number[]} prices  Array of closing prices
 * @param {number}   period  Window size N (default 20)
 * @returns {(number|null)[]}
 */
export function computeSMA(prices, period = 20) {
  return prices.map((_, i) => {
    if (i < period - 1) return null;
    const window = prices.slice(i - period + 1, i + 1);
    const sum    = window.reduce((acc, v) => acc + v, 0);
    return parseFloat((sum / period).toFixed(4));
  });
}

// ── EMA — Exponential Moving Average ─────────────────────────────────────────
/**
 * computeEMA — First-order IIR filter.
 *
 * Smoothing factor: k = 2 / (period + 1)
 * Recurrence:       EMA[i] = price[i] × k  +  EMA[i-1] × (1 - k)
 * Seed:             EMA[period-1] = SMA of first `period` prices
 *
 * Warm-up: first (period - 1) values are null.
 *
 * @param {number[]} prices  Array of closing prices
 * @param {number}   period  IIR time constant (default 20)
 * @returns {(number|null)[]}
 */
export function computeEMA(prices, period = 20) {
  const k      = 2 / (period + 1);
  const result = new Array(prices.length).fill(null);

  if (prices.length < period) return result;

  // Seed: SMA of first `period` values
  const seed = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = parseFloat(seed.toFixed(4));

  for (let i = period; i < prices.length; i++) {
    result[i] = parseFloat((prices[i] * k + result[i - 1] * (1 - k)).toFixed(4));
  }

  return result;
}

// ── RSI — Relative Strength Index ────────────────────────────────────────────
/**
 * computeRSI — Signal energy ratio of gains vs losses.
 *
 * RSI = 100 - (100 / (1 + RS))
 * RS  = avg_gain / avg_loss  (Wilder's smoothed averages over `period` bars)
 *
 * Warm-up: first `period` values are null.
 *
 * @param {number[]} prices  Array of closing prices
 * @param {number}   period  Lookback period (default 14)
 * @returns {(number|null)[]}
 */
export function computeRSI(prices, period = 14) {
  const result = new Array(prices.length).fill(null);

  if (prices.length < period + 1) return result;

  // Calculate all price changes
  const changes = prices.slice(1).map((p, i) => p - prices[i]);

  // Seed: simple averages of first `period` gains and losses
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else                 avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  const rsiAt = (ag, al) => {
    if (al === 0) return 100;
    if (ag === 0) return 0;
    return parseFloat((100 - 100 / (1 + ag / al)).toFixed(4));
  };

  result[period] = rsiAt(avgGain, avgLoss);

  // Wilder's smoothing for subsequent values
  for (let i = period + 1; i < prices.length; i++) {
    const change = changes[i - 1];
    const gain   = change > 0 ? change : 0;
    const loss   = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = rsiAt(avgGain, avgLoss);
  }

  return result;
}

// ── MACD — Moving Average Convergence/Divergence ─────────────────────────────
/**
 * computeMACD — difference of two EMA filters.
 *
 * Returns { macdLine, signalLine, histogram } — all arrays of length prices.length.
 *   macdLine   = EMA(fast) − EMA(slow)
 *   signalLine = EMA(9) of macdLine
 *   histogram  = macdLine − signalLine
 *
 * Null where warm-up is insufficient.
 *
 * @param {number[]} prices      Array of closing prices
 * @param {number}   fastPeriod  (default 12)
 * @param {number}   slowPeriod  (default 26)
 * @param {number}   signalPeriod (default 9)
 * @returns {{ macdLine: (number|null)[], signalLine: (number|null)[], histogram: (number|null)[] }}
 */
export function computeMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const emaFast = computeEMA(prices, fastPeriod);
  const emaSlow = computeEMA(prices, slowPeriod);

  const macdLine = prices.map((_, i) => {
    if (emaFast[i] === null || emaSlow[i] === null) return null;
    return parseFloat((emaFast[i] - emaSlow[i]).toFixed(4));
  });

  // Compute signal line = EMA(9) of macdLine (ignoring nulls)
  const macdValues    = macdLine.filter(v => v !== null);
  const signalRaw     = computeEMA(macdValues, signalPeriod);
  const signalLine    = new Array(prices.length).fill(null);
  const histogram     = new Array(prices.length).fill(null);

  let signalIdx = 0;
  for (let i = 0; i < prices.length; i++) {
    if (macdLine[i] !== null) {
      signalLine[i] = signalRaw[signalIdx] !== null ? signalRaw[signalIdx] : null;
      if (signalLine[i] !== null) {
        histogram[i] = parseFloat((macdLine[i] - signalLine[i]).toFixed(4));
      }
      signalIdx++;
    }
  }

  return { macdLine, signalLine, histogram };
}

// ── Bollinger Bands ───────────────────────────────────────────────────────────
/**
 * computeBollinger — SMA(20) ± 2 standard deviations.
 *
 * Returns { middle, upper, lower } — all arrays of length prices.length.
 * Null for warm-up period.
 *
 * @param {number[]} prices  Array of closing prices
 * @param {number}   period  (default 20)
 * @param {number}   stdDev  Multiplier (default 2)
 * @returns {{ middle: (number|null)[], upper: (number|null)[], lower: (number|null)[] }}
 */
export function computeBollinger(prices, period = 20, stdDev = 2) {
  const middle = computeSMA(prices, period);
  const upper  = new Array(prices.length).fill(null);
  const lower  = new Array(prices.length).fill(null);

  for (let i = period - 1; i < prices.length; i++) {
    const window   = prices.slice(i - period + 1, i + 1);
    const mean     = middle[i];
    const variance = window.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / period;
    const sigma    = Math.sqrt(variance);
    upper[i] = parseFloat((mean + stdDev * sigma).toFixed(4));
    lower[i] = parseFloat((mean - stdDev * sigma).toFixed(4));
  }

  return { middle, upper, lower };
}

// ── Bollinger Position Classifier ─────────────────────────────────────────────
/**
 * getBollingerPosition — classifies where the current price sits in the bands.
 *
 * Returns one of 5 string labels:
 *   'above_upper'   — price > upper band (overbought / breakout up)
 *   'upper_half'    — price between middle and upper
 *   'middle'        — price within ±0.5% of the middle band
 *   'lower_half'    — price between lower and middle
 *   'below_lower'   — price < lower band (oversold / breakout down)
 *
 * CRITICAL: Always use this function. Never hardcode 'middle'.
 *
 * @param {number} close   Current closing price
 * @param {number} upper   Upper Bollinger band value
 * @param {number} lower   Lower Bollinger band value
 * @param {number} middle  Middle band (SMA20) value
 * @returns {string}
 */
export function getBollingerPosition(close, upper, lower, middle) {
  if (close > upper)  return 'above_upper';
  if (close < lower)  return 'below_lower';
  const midRange = middle * 0.005; // ±0.5% tolerance for "at the middle"
  if (Math.abs(close - middle) <= midRange) return 'middle';
  if (close > middle) return 'upper_half';
  return 'lower_half';
}
