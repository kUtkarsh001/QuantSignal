/**
 * StockChart.jsx — Candlestick chart + SMA/EMA overlay + Bollinger Bands
 * Architecture §2.1 — Day 16
 *
 * Uses Recharts Customized component to draw candlesticks.
 * Recharts Bar shapes DON'T get yAxis.scale, but Customized DOES get
 * xAxisMap/yAxisMap — so we use Customized for full SVG control.
 *
 * Supports SMA/EMA toggle. Bollinger bands rendered as a shaded Area.
 * connectNulls={false} so warm-up null values don't crash the chart.
 */

import { useState, useMemo } from 'react';
import {
  ComposedChart, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Customized, Bar
} from 'recharts';
import styles from './StockChart.module.css';

// ── Candlestick layer — rendered via Customized ──────────────────────────────
// Receives xAxisMap + yAxisMap from Recharts internals.
function CandlestickLayer({ formattedGraphicalItems, xAxisMap, yAxisMap }) {
  if (!xAxisMap || !yAxisMap) return null;

  const xAxis = Object.values(xAxisMap)[0];
  const yAxis = Object.values(yAxisMap)[0];
  if (!xAxis?.scale || !yAxis?.scale) return null;

  const xScale    = xAxis.scale;
  const yScale    = yAxis.scale;
  const bandwidth = xScale.bandwidth ? xScale.bandwidth() : 12;

  // Get data from the first graphical item (our hidden reference bar)
  const items = formattedGraphicalItems?.[0]?.props?.data;
  if (!items?.length) return null;

  return (
    <g className="candlestick-layer">
      {items.map((item, i) => {
        const d = item?.payload;
        if (!d || d.open == null || d.close == null || d.high == null || d.low == null) return null;

        const x = xScale(d.date);
        if (x == null || isNaN(x)) return null;

        const cx       = x + bandwidth / 2;
        const barW     = Math.max(bandwidth * 0.55, 3);
        const openY    = yScale(d.open);
        const closeY   = yScale(d.close);
        const highY    = yScale(d.high);
        const lowY     = yScale(d.low);
        const isGreen  = d.close >= d.open;
        const color    = isGreen ? '#10b981' : '#ef4444';
        const bodyTop  = Math.min(openY, closeY);
        const bodyH    = Math.max(Math.abs(openY - closeY), 1);

        return (
          <g key={i}>
            {/* Wick */}
            <line
              x1={cx} y1={highY} x2={cx} y2={lowY}
              stroke={color} strokeWidth={1.2} opacity={0.85}
            />
            {/* Body */}
            <rect
              x={cx - barW / 2}
              y={bodyTop}
              width={barW}
              height={bodyH}
              fill={color}
              fillOpacity={isGreen ? 0.75 : 0.9}
              rx={1}
            />
          </g>
        );
      })}
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

          {/* Hidden reference bar — needed so Recharts creates
              the XAxis band scale and passes formattedGraphicalItems
              to the Customized component. Rendered invisible. */}
          <Bar dataKey="close" fill="transparent" isAnimationActive={false} legendType="none" />

          {/* Candlestick rendering via Customized — gets axis scales */}
          <Customized component={CandlestickLayer} />
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
