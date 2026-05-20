"""
fetch_stock.py — yfinance data fetcher
Architecture §3.4

Called by Node.js marketService.js as a child process:
  python fetch_stock.py <symbol> <period> <interval>

Fetches OHLCV data from Yahoo Finance via yfinance.
Prints a single JSON object to stdout, then exits.
Node.js captures stdout and JSON.parses it.

Args:
  symbol   — Yahoo Finance ticker (e.g. RELIANCE.NS, AAPL)
  period   — history range (default: 1mo)
  interval — candle size  (default: 1d)

Exit codes:
  0 — success (valid JSON printed to stdout)
  1 — error   (error JSON printed to stdout)
"""

import yfinance as yf
import json
import sys

# ── Read command-line arguments ───────────────────────────────────────────────
symbol   = sys.argv[1]
period   = sys.argv[2] if len(sys.argv) > 2 else '1mo'
interval = sys.argv[3] if len(sys.argv) > 3 else '1d'

try:
    ticker = yf.Ticker(symbol)
    hist   = ticker.history(period=period, interval=interval)

    # Empty DataFrame means symbol not found or bad period/interval combo
    if hist.empty:
        print(json.dumps({ 'error': f'Symbol {symbol} not found or returned no data.' }))
        sys.exit(1)

    # Build candles array — one object per row
    candles = []
    for ts, row in hist.iterrows():
        candles.append({
            'timestamp': ts.isoformat(),
            'open':      round(float(row['Open']),   2),
            'high':      round(float(row['High']),   2),
            'low':       round(float(row['Low']),    2),
            'close':     round(float(row['Close']),  2),
            'volume':    int(row['Volume'])
        })

    # Fetch company metadata
    info = ticker.info

    print(json.dumps({
        'symbol':       symbol,
        'companyName':  info.get('longName',      symbol),
        'sector':       info.get('sector',        'Unknown'),
        'exchange':     info.get('exchange',      'Unknown'),
        'currency':     info.get('currency',      'INR'),
        'currentPrice': info.get('currentPrice',  candles[-1]['close']),
        'candles':      candles
    }))

    sys.exit(0)

except Exception as e:
    print(json.dumps({ 'error': str(e) }))
    sys.exit(1)
