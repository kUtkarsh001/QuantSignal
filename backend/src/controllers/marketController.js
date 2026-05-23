import { fetchStockData } from '../services/marketService.js';
import {
  computeSMA,
  computeEMA,
  computeRSI,
  computeMACD,
  computeBollinger,
  getBollingerPosition
} from '../dsp/filters.js';

/**
 * Valid period/interval combinations — API Spec §GET /api/market/indicators
 * Mixing incompatible values (e.g. period=1d + interval=1wk) returns no data.
 */
const VALID_COMBOS = {
  '1d':  ['1m', '5m', '15m', '30m', '1h'],
  '5d':  ['5m', '15m', '30m', '1h'],
  '1mo': ['1h', '1d'],
  '3mo': ['1d', '1wk'],
  '6mo': ['1d', '1wk'],
  '1y':  ['1d', '1wk'],
  '2y':  ['1d', '1wk'],
  '5y':  ['1d', '1wk', '1mo'],
};

/**
 * getQuote — GET /api/market/quote?symbol=&period=&interval=
 * API Spec §GET /api/market/quote
 *
 * Returns raw OHLCV candles + metadata.
 * No DSP processing — just the raw price data from yfinance.
 */
export async function getQuote(req, res, next) {
  try {
    const { symbol, period = '1mo', interval = '1d' } = req.query;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'symbol query parameter is required.' }
      });
    }

    // Validate period/interval compatibility
    if (VALID_COMBOS[period] && !VALID_COMBOS[period].includes(interval)) {
      return res.status(400).json({
        success: false,
        error: {
          code:    'INVALID_PARAMS',
          message: `Interval '${interval}' is not compatible with period '${period}'. Valid intervals: ${VALID_COMBOS[period].join(', ')}`
        }
      });
    }

    const data = await fetchStockData(symbol.toUpperCase(), period, interval);

    res.status(200).json({
      success: true,
      data: {
        symbol:       data.symbol,
        companyName:  data.companyName,
        sector:       data.sector,
        exchange:     data.exchange,
        currency:     data.currency,
        currentPrice: data.currentPrice,
        candles:      data.candles,
        cachedAt:     data.cachedAt || null
      }
    });
  } catch (err) {
    // yfinance returns "not found" errors — surface as 404
    if (err.message.toLowerCase().includes('not found') ||
        err.message.toLowerCase().includes('no data')) {
      return res.status(404).json({
        success: false,
        error: { code: 'TICKER_NOT_FOUND', message: `Symbol not found or no data available.` }
      });
    }
    next(err);
  }
}

/**
 * getIndicators — GET /api/market/indicators?symbol=&period=&interval=
 * API Spec §GET /api/market/indicators
 *
 * Fetches OHLCV data then runs all 6 DSP filter functions.
 * Returns aligned arrays — all same length as candles.
 * Null values preserved for warm-up periods (do not replace with 0).
 *
 * Response includes bollingerPosition string for Agent A context.
 */
export async function getIndicators(req, res, next) {
  try {
    const { symbol, period = '1mo', interval = '1d' } = req.query;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'symbol query parameter is required.' }
      });
    }

    // Validate period/interval compatibility
    if (VALID_COMBOS[period] && !VALID_COMBOS[period].includes(interval)) {
      return res.status(400).json({
        success: false,
        error: {
          code:    'INVALID_PARAMS',
          message: `Interval '${interval}' is not compatible with period '${period}'. Valid intervals: ${VALID_COMBOS[period].join(', ')}`
        }
      });
    }

    const data   = await fetchStockData(symbol.toUpperCase(), period, interval);
    const closes = data.candles.map(c => c.close);

    // ── Run all DSP filters ───────────────────────────────────────────────────
    const sma20     = computeSMA(closes, 20);
    const ema12     = computeEMA(closes, 12);
    const ema26     = computeEMA(closes, 26);
    const rsi14     = computeRSI(closes, 14);
    const macd      = computeMACD(closes);
    const bollinger = computeBollinger(closes, 20);

    // Current (last) values for Agent A context
    const lastClose  = closes.at(-1);
    const lastSma20  = sma20.at(-1);
    const lastUpper  = bollinger.upper.at(-1);
    const lastLower  = bollinger.lower.at(-1);
    const lastMiddle = bollinger.middle.at(-1);

    const bollingerPosition = (lastUpper && lastLower && lastMiddle)
      ? getBollingerPosition(lastClose, lastUpper, lastLower, lastMiddle)
      : 'unknown';

    // price_vs_sma20: percentage above/below SMA20 (used by Agent A)
    const priceVsSma20 = lastSma20
      ? parseFloat(((lastClose - lastSma20) / lastSma20 * 100).toFixed(2))
      : null;

    res.status(200).json({
      success: true,
      data: {
        symbol:      data.symbol,
        companyName: data.companyName,
        sector:      data.sector,
        currency:    data.currency,
        // Aligned arrays — same length as candles, nulls for warm-up
        timestamps:  data.candles.map(c => c.timestamp),
        closes,
        sma20,
        ema12,
        ema26,
        rsi14,
        macd: {
          macdLine:   macd.macdLine,
          signalLine: macd.signalLine,
          histogram:  macd.histogram
        },
        bollinger: {
          upper:  bollinger.upper,
          middle: bollinger.middle,
          lower:  bollinger.lower
        },
        // Summary values for Agent A — latest snapshot
        summary: {
          currentPrice:      lastClose,
          sma20:             lastSma20,
          ema12:             ema12.at(-1),
          ema26:             ema26.at(-1),
          rsi14:             rsi14.at(-1),
          macdHistogram:     macd.histogram.at(-1),
          bollingerUpper:    lastUpper,
          bollingerLower:    lastLower,
          bollingerPosition,
          priceVsSma20
        }
      }
    });
  } catch (err) {
    if (err.message.toLowerCase().includes('not found') ||
        err.message.toLowerCase().includes('no data')) {
      return res.status(404).json({
        success: false,
        error: { code: 'TICKER_NOT_FOUND', message: `Symbol not found or no data available.` }
      });
    }
    next(err);
  }
}
