/**
 * Dashboard.jsx — Main analysis page
 * Architecture §2.1 — Day 16
 *
 * Flow:
 *   1. Receives searchSymbol from App.jsx (triggered by Navbar search)
 *   2. Fetches quote + indicators in parallel via marketService
 *   3. Merges into chartData array (one object per candle with all indicators)
 *   4. Renders: company header → StockChart → IndicatorPanel
 *
 * Day 17 will add: Analyze button → AgentResultPanel → ConfidenceGauge
 */

import { useEffect, useState, useMemo } from 'react';
import { useAuth }       from '../contexts/AuthContext.jsx';
import { marketService } from '../services/marketService.js';
import StockChart        from '../components/StockChart.jsx';
import IndicatorPanel    from '../components/IndicatorPanel.jsx';
import styles            from './Dashboard.module.css';

// ── Sector colour map ─────────────────────────────────────────────────────────
const SECTOR_COLORS = {
  'Technology':         '#60a5fa',
  'Energy':             '#f59e0b',
  'Financial Services': '#10b981',
  'Healthcare':         '#a78bfa',
  'Consumer Cyclical':  '#f97316',
  'Industrials':        '#06b6d4',
  'Basic Materials':    '#84cc16',
  'Communication Services': '#ec4899',
};
const sectorColor = (s) => SECTOR_COLORS[s] || '#94a3b8';

// ── Format large numbers (volume etc.) ───────────────────────────────────────
function fmt(n) {
  if (n >= 1e7) return (n / 1e7).toFixed(1) + 'Cr';
  if (n >= 1e5) return (n / 1e5).toFixed(1) + 'L';
  return n?.toLocaleString('en-IN');
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function Stat({ label, value, accent }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue} style={accent ? { color: accent } : {}}>{value}</span>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className={styles.skeleton}>
      <div className={`${styles.skeletonBar} ${styles.skeletonTitle}`} />
      <div className={`${styles.skeletonBar} ${styles.skeletonChart}`} />
      <div className={`${styles.skeletonBar} ${styles.skeletonSmall}`} />
      <div className={`${styles.skeletonBar} ${styles.skeletonSmall}`} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Dashboard({ searchSymbol }) {
  const { token } = useAuth();

  const [quoteData,  setQuoteData]  = useState(null);
  const [indicators, setIndicators] = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  // Fetch when symbol changes
  useEffect(() => {
    if (!searchSymbol || !token) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      setQuoteData(null);
      setIndicators(null);

      try {
        const [q, ind] = await Promise.all([
          marketService.fetchQuote(searchSymbol, token),
          marketService.fetchIndicators(searchSymbol, token),
        ]);
        if (!cancelled) {
          setQuoteData(q.data ?? q);
          setIndicators(ind.data ?? ind);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to fetch market data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [searchSymbol, token]);

  // Merge candles + indicators into single chartData array
  const chartData = useMemo(() => {
    if (!quoteData?.candles?.length) return [];
    const candles = quoteData.candles;

    return candles.map((c, i) => {
      const date = new Date(c.timestamp);
      const label = date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      return {
        date,
        label,
        // Price data
        open:   c.open,
        high:   c.high,
        low:    c.low,
        close:  c.close,
        volume: c.volume,
        // Indicators — fallback to null if index out of range
        sma20:          indicators?.sma20?.[i]              ?? null,
        ema12:          indicators?.ema12?.[i]              ?? null,
        ema26:          indicators?.ema26?.[i]              ?? null,
        rsi14:          indicators?.rsi14?.[i]              ?? null,
        macdLine:       indicators?.macd?.macdLine?.[i]    ?? null,
        signalLine:     indicators?.macd?.signalLine?.[i]  ?? null,
        histogram:      indicators?.macd?.histogram?.[i]   ?? null,
        bollingerUpper: indicators?.bollinger?.upper?.[i]  ?? null,
        bollingerMiddle:indicators?.bollinger?.middle?.[i] ?? null,
        bollingerLower: indicators?.bollinger?.lower?.[i]  ?? null,
      };
    })
    // Use label as the XAxis key
    .map(d => ({ ...d, date: d.label }));
  }, [quoteData, indicators]);

  // Derived stats
  const latestCandle  = quoteData?.candles?.at(-1);
  const prevCandle    = quoteData?.candles?.at(-2);
  const change        = latestCandle && prevCandle
    ? ((latestCandle.close - prevCandle.close) / prevCandle.close * 100)
    : null;
  const latestRSI     = chartData.at(-1)?.rsi14;
  const latestSMA20   = chartData.at(-1)?.sma20;

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!searchSymbol) {
    return (
      <div className={styles.emptyPage}>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📈</div>
          <h2 className={styles.emptyTitle}>Ready to Analyze</h2>
          <p className={styles.emptySub}>
            Search for a ticker in the top bar — e.g.{' '}
            <code>RELIANCE.NS</code>, <code>AAPL</code>, <code>TCS.NS</code>
          </p>
          <div className={styles.shortcutHint}>
            <span className={styles.kbd}>Type ticker</span> then press <span className={styles.kbd}>Analyze</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) return <Skeleton />;

  // ── Error ───────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={styles.errorState}>
        <span className={styles.errorIcon}>⚠️</span>
        <h3>Failed to load {searchSymbol}</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (!quoteData) return null;

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      {/* Company header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.symbolBadge}>
            <span className={styles.symbol}>{quoteData.symbol}</span>
            {quoteData.sector && (
              <span
                className={styles.sectorTag}
                style={{
                  background: `${sectorColor(quoteData.sector)}18`,
                  color:      sectorColor(quoteData.sector),
                  borderColor:`${sectorColor(quoteData.sector)}33`,
                }}
              >
                {quoteData.sector}
              </span>
            )}
          </div>
          <div className={styles.companyName}>{quoteData.companyName}</div>
        </div>

        <div className={styles.priceBlock}>
          <div className={styles.price}>
            {quoteData.currency === 'INR' ? '₹' : '$'}
            {quoteData.currentPrice?.toFixed(2)}
          </div>
          {change != null && (
            <div
              className={styles.change}
              style={{ color: change >= 0 ? '#10b981' : '#ef4444' }}
            >
              {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className={styles.statsRow}>
        <Stat label="High"    value={`₹${latestCandle?.high?.toFixed(2)}`} />
        <Stat label="Low"     value={`₹${latestCandle?.low?.toFixed(2)}`} />
        <Stat label="Volume"  value={fmt(latestCandle?.volume)} />
        {latestSMA20 != null && (
          <Stat label="SMA-20" value={`₹${latestSMA20?.toFixed(2)}`} accent="#f59e0b" />
        )}
        {latestRSI != null && (
          <Stat
            label="RSI-14"
            value={latestRSI?.toFixed(1)}
            accent={latestRSI >= 70 ? '#ef4444' : latestRSI <= 30 ? '#10b981' : '#94a3b8'}
          />
        )}
        <Stat label="Exchange" value={quoteData.exchange} />
      </div>

      {/* Charts */}
      <div className={styles.chartCard}>
        <StockChart data={chartData} />
      </div>

      <IndicatorPanel data={chartData} />
    </div>
  );
}
