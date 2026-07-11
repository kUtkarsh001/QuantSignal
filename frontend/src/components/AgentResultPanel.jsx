/**
 * AgentResultPanel.jsx — Displays the multi-agent analysis results
 * Architecture §2.1 — Day 17
 *
 * Layout:
 *   ┌──────────────────────────────────────────────┐
 *   │ [ConfidenceGauge]  │  Signal  │  Latency     │
 *   ├──────────────────────────────────────────────┤
 *   │ Agent A — Chart Analyst                      │
 *   │   trend / strength / reasoning               │
 *   ├──────────────────────────────────────────────┤
 *   │ Agent B — Sentiment Analyst (if available)   │
 *   │   sentiment / evidence / confidence          │
 *   ├──────────────────────────────────────────────┤
 *   │ Agent C — Meta-Analyst                       │
 *   │   agreement / reasoning / score breakdown    │
 *   └──────────────────────────────────────────────┘
 *
 * Matches the backend response shape:
 *   { analysisId, symbol, agentA, agentB, agentC, chartSnapshot, latencyMs, agentBAvailable }
 */

import ConfidenceGauge from './ConfidenceGauge.jsx';
import styles from './AgentResultPanel.module.css';

// ── Signal badge colour ──────────────────────────────────────────────────────
const SIGNAL_COLORS = {
  bullish: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)', text: '#10b981', icon: '▲' },
  bearish: { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)',  text: '#ef4444', icon: '▼' },
  neutral: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)', text: '#f59e0b', icon: '◆' },
};

function SignalBadge({ signal }) {
  const s = SIGNAL_COLORS[signal] || SIGNAL_COLORS.neutral;
  return (
    <span
      className={styles.signalBadge}
      style={{ background: s.bg, borderColor: s.border, color: s.text }}
    >
      {s.icon} {signal?.toUpperCase() || 'N/A'}
    </span>
  );
}

// ── Strength meter (0–100 bar) ───────────────────────────────────────────────
function StrengthBar({ value = 0, label = 'Strength' }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = clamped <= 30 ? '#ef4444' : clamped <= 60 ? '#f59e0b' : '#10b981';
  return (
    <div className={styles.strengthRow}>
      <span className={styles.strengthLabel}>{label}</span>
      <div className={styles.strengthTrack}>
        <div
          className={styles.strengthFill}
          style={{ width: `${clamped}%`, background: color }}
        />
      </div>
      <span className={styles.strengthValue} style={{ color }}>{clamped}</span>
    </div>
  );
}

// ── Agent card ───────────────────────────────────────────────────────────────
function AgentCard({ title, icon, accent, children, unavailable }) {
  return (
    <div className={`${styles.agentCard} ${unavailable ? styles.unavailable : ''}`}>
      <div className={styles.agentHeader}>
        <span className={styles.agentIcon} style={{ color: accent }}>{icon}</span>
        <span className={styles.agentTitle}>{title}</span>
        {unavailable && <span className={styles.unavailableTag}>No RAG Data</span>}
      </div>
      <div className={styles.agentBody}>
        {children}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function AgentResultPanel({ result }) {
  if (!result) return null;

  const { agentA, agentB, agentC, chartSnapshot, latencyMs, agentBAvailable, analysisId } = result;

  const confidenceScore = agentC?.confidenceScore ?? 0;
  const signal = agentA?.trend || 'neutral';

  return (
    <div className={styles.panel}>
      {/* ── Top row: Gauge + Signal + Meta ── */}
      <div className={styles.topRow}>
        <ConfidenceGauge score={confidenceScore} />

        <div className={styles.metaBlock}>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Signal</span>
            <SignalBadge signal={signal} />
          </div>
          {chartSnapshot && (
            <>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>Price</span>
                <span className={styles.metaValue}>₹{chartSnapshot.priceAtAnalysis?.toFixed(2)}</span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>RSI-14</span>
                <span className={styles.metaValue}>{chartSnapshot.rsi14?.toFixed(1)}</span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>SMA-20</span>
                <span className={styles.metaValue}>₹{chartSnapshot.sma20?.toFixed(2)}</span>
              </div>
            </>
          )}
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Latency</span>
            <span className={styles.metaValue}>{(latencyMs / 1000).toFixed(1)}s</span>
          </div>
          {analysisId && (
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>ID</span>
              <span className={styles.metaValueMono}>{analysisId.slice(-8)}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Agent A — Chart Analyst ── */}
      {agentA && (
        <AgentCard title="Agent A — Chart Analyst" icon="📊" accent="#60a5fa">
          <div className={styles.row}>
            <span className={styles.fieldLabel}>Trend</span>
            <SignalBadge signal={agentA.trend} />
          </div>
          <StrengthBar value={agentA.strength} label="Conviction" />
          <p className={styles.reasoning}>{agentA.reasoning}</p>
        </AgentCard>
      )}

      {/* ── Agent B — Sentiment Analyst ── */}
      <AgentCard
        title="Agent B — Sentiment Analyst"
        icon="📰"
        accent="#f59e0b"
        unavailable={!agentBAvailable}
      >
        {agentBAvailable ? (
          <>
            <div className={styles.row}>
              <span className={styles.fieldLabel}>Sentiment</span>
              <SignalBadge signal={agentB?.sentiment} />
            </div>
            <StrengthBar value={agentB?.confidence} label="Confidence" />
            <p className={styles.reasoning}>{agentB?.evidence}</p>
          </>
        ) : (
          <p className={styles.reasoning} style={{ opacity: 0.6 }}>
            {agentB?.evidence || 'No documents uploaded to RAG knowledge base. Upload sector reports to enable sentiment analysis.'}
          </p>
        )}
      </AgentCard>

      {/* ── Agent C — Meta-Analyst ── */}
      {agentC && (
        <AgentCard title="Agent C — Meta-Analyst" icon="🧠" accent="#a78bfa">
          <div className={styles.row}>
            <span className={styles.fieldLabel}>Agreement</span>
            <span className={`${styles.agreementTag} ${agentC.agreement ? styles.agree : styles.disagree}`}>
              {agentC.agreement ? '✓ Agents Agree' : '✗ Conflict Detected'}
            </span>
          </div>

          {agentC.conflictFlag && (
            <div className={styles.conflictAlert}>
              ⚠️ {agentC.conflictFlag}
            </div>
          )}

          <p className={styles.reasoning}>{agentC.reasoning}</p>

          {agentC.scoreBreakdown && (
            <div className={styles.breakdownGrid}>
              <div className={styles.breakdownItem}>
                <span className={styles.breakdownLabel}>Agent A</span>
                <span className={styles.breakdownValue}>+{agentC.scoreBreakdown.agentAContribution}</span>
              </div>
              <div className={styles.breakdownItem}>
                <span className={styles.breakdownLabel}>Agent B</span>
                <span className={styles.breakdownValue}>+{agentC.scoreBreakdown.agentBContribution}</span>
              </div>
              <div className={styles.breakdownItem}>
                <span className={styles.breakdownLabel}>Penalty</span>
                <span className={styles.breakdownValue} style={{ color: '#ef4444' }}>
                  -{agentC.scoreBreakdown.penaltyApplied}
                </span>
              </div>
              <div className={styles.breakdownItem}>
                <span className={styles.breakdownLabel}>Total</span>
                <span className={styles.breakdownValue} style={{ fontWeight: 800 }}>
                  {confidenceScore}
                </span>
              </div>
            </div>
          )}
        </AgentCard>
      )}
    </div>
  );
}
