/**
 * Dashboard.jsx — Main analysis page (Day 15 placeholder)
 * Day 16 will add StockChart + IndicatorPanel.
 * Day 17 will add AgentResultPanel + ConfidenceGauge.
 */

import styles from './Dashboard.module.css';

export default function Dashboard({ searchSymbol }) {
  return (
    <div className={styles.page}>
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>📈</div>
        <h2 className={styles.emptyTitle}>Ready to Analyze</h2>
        <p className={styles.emptySub}>
          Search for a ticker in the top bar — e.g. <code>RELIANCE.NS</code>, <code>AAPL</code>, <code>TCS.NS</code>
        </p>
        <div className={styles.shortcutHint}>
          <span className={styles.kbd}>Type a ticker</span> and press <span className={styles.kbd}>Analyze</span>
        </div>
      </div>
    </div>
  );
}
