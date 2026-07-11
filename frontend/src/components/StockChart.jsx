/**
 * StockChart.jsx — Candlestick chart + SMA/EMA overlay + Bollinger Bands
 * Architecture §2.1 — Day 16
 *
 * Uses Recharts ComposedChart with a custom candlestick Bar shape.
 * Supports SMA/EMA toggle. Bollinger bands rendered as a shaded Area.
 * connectNulls={false} so warm-up null values don't crash the chart.
 */

import { useState, useMemo } from 'react';
import {
  ComposedChart, Bar, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';
import styles from './StockChart.module.css';

// ── Custom candlestick bar shape ─────────────────────────────────────────────
// Receives props from Recharts including yAxis (with scale function).
function CandlestickBar(props) {
  const { x, y, width, payload, yAxis } = props;
  if (!payload || !yAxis?.scale) return null;

  const { open, high, low, close } = payload;
  const scale   = yAxis.scale;
  const highY   = scale(high);
  const lowY    = scale(low);
  const openY   = scale(open);
  const closeY  = scale(close);

  const isGreen    = close >= open;
  const color      = isGreen ? '#10b981' : '#ef4444';
  const bodyTop    = Math.min(openY, closeY);
  const bodyHeight = Math.max(Math.abs(openY - closeY), 1);
  const centerX    = x + width / 2;
  const bodyW      = Math.max(width * 0.65, 3);

  return (
    <g>
      {/* Wick */}
      <line x1={centerX} y1={highY} x2={centerX} y2={lowY}
        stroke={color} strokeWidth={1.5} opacity={0.9} />
      {/* Body */}
      <rect
        x={centerX - bodyW / 2}
        y={bodyTop}
        width={bodyW}
        height={bodyHeight}
        fill={color}
        fillOpacity={isGreen ? 0.75 : 0.9}
        rx={1}
      />
    </g>
  );
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function CandleTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const isGreen = d.close >= d.open;
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipDate}>{label}</div>
      <div className={styles.tooltipRow}>
        <span>O</span><span style={{ color: '#94a3b8' }}>{d.open?.toFixed(2)}</span>
      </div>
      <div className={styles.tooltipRow}>
        <span>H</span><span style={{ color: '#10b981' }}>{d.high?.toFixed(2)}</span>
      </div>
      <div className={styles.tooltipRow}>
        <span>L</span><span style={{ color: '#ef4444' }}>{d.low?.toFixed(2)}</span>
      </div>
      <div className={styles.tooltipRow}>
        <span>C</span>
        <span style={{ color: isGreen ? '#10b981' : '#ef4444', fontWeight: 700 }}>
          {d.close?.toFixed(2)}
        </span>
      </div>
      {d.sma20 != null && (
        <div className={styles.tooltipRow}>
          <span style={{ color: '#f59e0b' }}>SMA20</span>
          <span>{d.sma20?.toFixed(2)}</span>
        </div>
      )}
      {d.ema12 != null && (
        <div className={styles.tooltipRow}>
          <span style={{ color: '#a78bfa' }}>EMA12</span>
          <span>{d.ema12?.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function StockChart({ data }) {
  const [overlay, setOverlay] = useState('sma'); // 'sma' | 'ema' | 'both' | 'none'
  const [showBollinger, setShowBollinger] = useState(true);

  // Y-axis domain: span all visible data including indicators + wicks
  const yDomain = useMemo(() => {
    if (!data?.length) return ['auto', 'auto'];
    const vals = data.flatMap(d => [
      d.high, d.low,
      d.sma20, d.ema12, d.ema26,
      d.bollingerUpper, d.bollingerLower,
    ].filter(v => v != null && !isNaN(v)));
    if (!vals.length) return ['auto', 'auto'];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.04;
    return [min - pad, max + pad];
  }, [data]);

  if (!data?.length) return null;

  return (
    <div className={styles.wrapper}>
      {/* Controls */}
      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Overlay</span>
          {[
            { key: 'sma',  label: 'SMA-20' },
            { key: 'ema',  label: 'EMA-12' },
            { key: 'both', label: 'Both' },
            { key: 'none', label: 'None' },
          ].map(o => (
            <button
              key={o.key}
              id={`overlay-${o.key}`}
              className={`${styles.pill} ${overlay === o.key ? styles.pillActive : ''}`}
              onClick={() => setOverlay(o.key)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className={styles.controlGroup}>
          <button
            id="toggle-bollinger"
            className={`${styles.pill} ${showBollinger ? styles.pillActivePurple : ''}`}
            onClick={() => setShowBollinger(v => !v)}
          >
            Bollinger
          </button>
        </div>
      </div>

      {/* Main chart */}
      <ResponsiveContainer width="100%" height={380}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />

          <XAxis
            dataKey="date"
            tick={{ fill: '#475569', fontSize: 11, fontFamily: 'Inter' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />

          <YAxis
            domain={yDomain}
            tick={{ fill: '#475569', fontSize: 11, fontFamily: 'Inter' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => v.toFixed(0)}
            width={64}
            orientation="right"
          />

          <Tooltip content={<CandleTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />

          {/* Bollinger band shaded area */}
          {showBollinger && (
            <>
              <Area
                dataKey="bollingerUpper"
                stroke="#7c3aed"
                strokeWidth={1}
                strokeDasharray="4 2"
                fill="transparent"
                dot={false}
                connectNulls={false}
                legendType="none"
                isAnimationActive={false}
              />
              <Area
                dataKey="bollingerLower"
                stroke="#7c3aed"
                strokeWidth={1}
                strokeDasharray="4 2"
                fill="#7c3aed"
                fillOpacity={0.06}
                dot={false}
                connectNulls={false}
                legendType="none"
                isAnimationActive={false}
              />
            </>
          )}

          {/* SMA-20 */}
          {(overlay === 'sma' || overlay === 'both') && (
            <Line
              dataKey="sma20"
              stroke="#f59e0b"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              name="SMA-20"
              isAnimationActive={false}
            />
          )}

          {/* EMA-12 */}
          {(overlay === 'ema' || overlay === 'both') && (
            <Line
              dataKey="ema12"
              stroke="#a78bfa"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
              name="EMA-12"
              isAnimationActive={false}
            />
          )}

          {/* Candlestick bars — dataKey="close" sets y-scale, custom shape renders full OHLC */}
          <Bar
            dataKey="close"
            shape={<CandlestickBar />}
            isAnimationActive={false}
            legendType="none"
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Volume bar chart */}
      <div className={styles.volumeLabel}>Volume</div>
      <ResponsiveContainer width="100%" height={60}>
        <ComposedChart data={data} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <XAxis dataKey="date" hide />
          <YAxis hide />
          <Bar
            dataKey="volume"
            fill="rgba(59,130,246,0.25)"
            isAnimationActive={false}
            radius={[2,2,0,0]}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
