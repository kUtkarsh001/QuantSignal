/**
 * ConfidenceGauge.jsx — Animated radial gauge showing confidence score
 * Architecture §2.1 — Day 17
 *
 * SVG arc gauge (0–100) with animated stroke-dashoffset.
 * Colour transitions: red (0-30) → amber (31-60) → green (61-100).
 * Center shows the numeric score with a label underneath.
 */

import { useMemo } from 'react';
import styles from './ConfidenceGauge.module.css';

const RADIUS      = 62;
const STROKE      = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ARC_FRACTION  = 0.75;                       // 270° arc
const ARC_LENGTH    = CIRCUMFERENCE * ARC_FRACTION;

function scoreColor(score) {
  if (score <= 30) return '#ef4444';
  if (score <= 60) return '#f59e0b';
  return '#10b981';
}

function scoreLabel(score) {
  if (score <= 30) return 'Low';
  if (score <= 60) return 'Moderate';
  if (score <= 80) return 'High';
  return 'Very High';
}

export default function ConfidenceGauge({ score = 0 }) {
  const clamped  = Math.max(0, Math.min(100, score));
  const color    = useMemo(() => scoreColor(clamped), [clamped]);
  const label    = useMemo(() => scoreLabel(clamped), [clamped]);
  const offset   = ARC_LENGTH * (1 - clamped / 100);

  const size     = (RADIUS + STROKE) * 2;
  const center   = size / 2;

  // Rotate so the gap is at the bottom
  const rotation = 135; // start from bottom-left

  return (
    <div className={styles.wrapper}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={styles.svg}
      >
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={STROKE}
          strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
          strokeLinecap="round"
          transform={`rotate(${rotation} ${center} ${center})`}
        />
        {/* Filled arc */}
        <circle
          cx={center}
          cy={center}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(${rotation} ${center} ${center})`}
          className={styles.arc}
          style={{ '--gauge-color': color }}
        />
      </svg>

      {/* Center text */}
      <div className={styles.center}>
        <span className={styles.score} style={{ color }}>{clamped}</span>
        <span className={styles.label} style={{ color }}>{label}</span>
        <span className={styles.subtitle}>Confidence</span>
      </div>
    </div>
  );
}
