/**
 * IndicatorPanel.jsx — RSI sub-chart + MACD histogram + signal line
 * Architecture §2.1 — Day 16
 *
 * RSI chart: line with reference lines at 70 (overbought) and 30 (oversold).
 * MACD chart: histogram bars (green/red) + macdLine + signalLine.
 * Both use connectNulls={false} to handle warm-up null values gracefully.
 */

import {
  ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell
} from 'recharts';
import styles from './IndicatorPanel.module.css';

// ── RSI Tooltip ──────────────────────────────────────────────────────────────
function RSITooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const rsi = payload.find(p => p.dataKey === 'rsi14')?.value;
  if (rsi == null) return null;
  const zone = rsi >= 70 ? 'Overbought' : rsi <= 30 ? 'Oversold' : 'Neutral';
  const color = rsi >= 70 ? '#ef4444' : rsi <= 30 ? '#10b981' : '#94a3b8';
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipDate}>{label}</div>
      <div className={styles.tooltipRow}>
        <span style={{ color: '#60a5fa' }}>RSI-14</span>
        <span style={{ color, fontWeight: 700 }}>{rsi.toFixed(1)}</span>
      </div>
      <div className={styles.tooltipZone} style={{ color }}>{zone}</div>
    </div>
  );
}

// ── MACD Tooltip ─────────────────────────────────────────────────────────────
function MACDTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const get = (key) => payload.find(p => p.dataKey === key)?.value;
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipDate}>{label}</div>
      {get('macdLine') != null && (
        <div className={styles.tooltipRow}>
          <span style={{ color: '#60a5fa' }}>MACD</span>
          <span>{get('macdLine')?.toFixed(3)}</span>
        </div>
      )}
      {get('signalLine') != null && (
        <div className={styles.tooltipRow}>
          <span style={{ color: '#f59e0b' }}>Signal</span>
          <span>{get('signalLine')?.toFixed(3)}</span>
        </div>
      )}
      {get('histogram') != null && (
        <div className={styles.tooltipRow}>
          <span style={{ color: get('histogram') >= 0 ? '#10b981' : '#ef4444' }}>Hist</span>
          <span>{get('histogram')?.toFixed(3)}</span>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function IndicatorPanel({ data }) {
  if (!data?.length) return null;

  return (
    <div className={styles.wrapper}>
      {/* ── RSI Chart ── */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>RSI-14</span>
          <span className={styles.panelHint}>
            <span className={styles.dot} style={{ background: '#ef4444' }} /> &gt;70 Overbought &nbsp;
            <span className={styles.dot} style={{ background: '#10b981' }} /> &lt;30 Oversold
          </span>
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <ComposedChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="date" hide />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 30, 50, 70, 100]}
              tick={{ fill: '#475569', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={32}
              orientation="right"
            />
            <Tooltip content={<RSITooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)' }} />

            {/* Reference lines */}
            <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 2" strokeOpacity={0.5} />
            <ReferenceLine y={30} stroke="#10b981" strokeDasharray="4 2" strokeOpacity={0.5} />
            <ReferenceLine y={50} stroke="rgba(255,255,255,0.06)" />

            <Line
              dataKey="rsi14"
              stroke="#60a5fa"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── MACD Chart ── */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>MACD</span>
          <span className={styles.panelHint}>
            <span className={styles.legendDot} style={{ background: '#60a5fa' }} /> MACD &nbsp;
            <span className={styles.legendDot} style={{ background: '#f59e0b' }} /> Signal &nbsp;
            <span className={styles.legendDot} style={{ background: '#10b981' }} /> Histogram
          </span>
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <ComposedChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="date" hide />
            <YAxis
              tick={{ fill: '#475569', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={48}
              orientation="right"
              tickFormatter={v => v.toFixed(1)}
            />
            <Tooltip content={<MACDTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)' }} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />

            {/* Histogram bars — green positive, red negative */}
            <Bar dataKey="histogram" isAnimationActive={false} maxBarSize={8}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.histogram >= 0 ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)'}
                />
              ))}
            </Bar>

            {/* MACD line */}
            <Line
              dataKey="macdLine"
              stroke="#60a5fa"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
            {/* Signal line */}
            <Line
              dataKey="signalLine"
              stroke="#f59e0b"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
