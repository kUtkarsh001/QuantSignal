/**
 * agentA.js — Chart Signal Analyst
 * Architecture §6.1
 *
 * Receives structured numerical indicator data for a stock symbol.
 * Reasons purely from quantitative chart signals (RSI, MACD, SMA, Bollinger).
 * No external tools, no document retrieval — numbers only.
 *
 * Input variables:
 *   symbol            — ticker (e.g. 'RELIANCE.NS')
 *   rsi               — RSI-14 value (>70 overbought, <30 oversold)
 *   macd_hist         — MACD histogram (positive = bullish momentum)
 *   price_vs_sma20    — 'above' or 'below' SMA-20
 *   bollinger_position — output of getBollingerPosition() from filters.js
 *
 * Output: JSON string → { trend, strength, reasoning }
 *   trend    : 'bullish' | 'bearish' | 'neutral'
 *   strength : integer 0–50
 *   reasoning: plain English explanation
 *
 * CRITICAL: Always use safeParseJSON() on the output — never JSON.parse() directly.
 * Gemini may wrap output in ```json fences even when told not to.
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

// ── Gemini model — shared across all agents ──────────────────────────────────
// Using gemini-2.5-flash (confirmed working in this environment — §ragService.js)
const model = new ChatGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
  model:  'gemini-2.5-flash',
});

// ── Prompt — Architecture §6.1 ───────────────────────────────────────────────
const prompt = ChatPromptTemplate.fromTemplate(`
You are a quantitative chart analyst. Analyse the following market data:

Symbol: {symbol}
Current RSI-14: {rsi}        (>70 = overbought, <30 = oversold)
MACD Histogram: {macd_hist}  (positive = bullish momentum)
Price vs SMA-20: {price_vs_sma20} (above = bullish)
Bollinger Position: {bollinger_position} (upper/middle/lower band)

Output ONLY a valid JSON object, no extra text:
{{ "trend": "bullish"|"bearish"|"neutral", "strength": <integer 0-50>, "reasoning": "<string>" }}
`);

// ── Chain export — agentController invokes this ──────────────────────────────
export const agentAChain = prompt.pipe(model);
