/**
 * AnalysisLog.js — MongoDB Collection 2
 * DB Schema v2.0 §Collection 2
 *
 * Auto-written by agentController.js after every POST /api/agent/analyze.
 * Never created manually by the user.
 *
 * Two purposes:
 *   1. History display — GET /api/agent/history reads from here
 *   2. Audit trail    — every agent output + score breakdown is permanently recorded
 *
 * Sub-documents (no _id):
 *   agentASchema       — Chart Signal Analyst output (trend, strength 0-50, reasoning)
 *   agentBSchema       — Document Sentiment Analyst output (sentiment, evidence, confidence 0-50)
 *   agentCSchema       — Manager/Synthesiser output (confidenceScore, agreement, conflictFlag, reasoning)
 *   chartSnapshotSchema — Point-in-time indicator values used as Agent A's input
 */

import mongoose from 'mongoose';

// ── Agent A sub-document ──────────────────────────────────────────────────────
const agentASchema = new mongoose.Schema({
  trend: {
    type:     String,
    enum:     ['bullish', 'bearish', 'neutral'],
    required: true
    // 'bullish' → RSI, MACD, SMA position all suggest upward movement
    // 'bearish' → indicators suggest downward pressure
    // 'neutral' → mixed or inconclusive signals
  },
  strength: {
    type:     Number,
    min:      0,
    max:      50,
    required: true
    // Agent A's contribution to the final Confidence Score (0–50).
    // Agent C adds this to Agent B's confidence to get the 0–100 score.
  },
  reasoning: {
    type:      String,
    required:  true,
    minlength: [20, 'Agent A reasoning must be at least 20 characters']
    // Plain-English explanation of what the indicators showed.
    // Displayed in AgentCard on the frontend.
  }
}, { _id: false });

// ── Agent B sub-document ──────────────────────────────────────────────────────
const agentBSchema = new mongoose.Schema({
  sentiment: {
    type:     String,
    enum:     ['positive', 'negative', 'neutral'],
    required: true
    // Macroeconomic outlook from the PDF documents.
    // 'neutral' when no documents uploaded or Pinecone unreachable.
  },
  evidence: {
    type:     String,
    required: true
    // Cited passage from PDF, e.g.: "The MPC voted to hold repo rate [RBI.pdf, Page 12]"
    // Value = 'No documents available.' when agentBAvailable = false.
  },
  confidence: {
    type:     Number,
    min:      0,
    max:      50,
    required: true
    // Agent B's contribution to the final Confidence Score (0–50).
    // Will be 0 if agentBAvailable is false (no documents).
  }
}, { _id: false });

// ── Agent C sub-document ──────────────────────────────────────────────────────
const agentCSchema = new mongoose.Schema({
  confidenceScore: {
    type:     Number,
    min:      0,
    max:      100,
    required: true
    // Computed SERVER-SIDE in agentController.js — NEVER by Gemini.
    // Formula (Architecture §6.5):
    //   agreement=true:    agentA.strength + agentB.confidence
    //   agreement=false:   round((agentA.strength + agentB.confidence) × 0.70)
    //   agentB unavail:    agentA.strength × 2
    // UI colour: red (<40), amber (40-70), green (>70) [PRD US-07]
  },
  agreement: {
    type:     Boolean,
    required: true
    // true  → Agent A chart signal and Agent B macro sentiment align
    // false → conflict detected; score penalised ×0.70; conflictFlag shown in UI
  },
  conflictFlag: {
    type:    String,
    default: null
    // Non-null only when agreement=false.
    // One sentence describing the conflict, shown prominently in the UI.
  },
  reasoning: {
    type:      String,
    required:  true,
    minlength: [100, 'Agent C reasoning must be at least 100 characters (≈3 sentences)']
    // PRD §6.2: minimum 3 complete sentences explaining the score.
  },
  scoreBreakdown: {
    agentAContribution: {
      type: Number
      // Raw strength value from Agent A (0–50). Always present.
    },
    agentBContribution: {
      type: Number
      // Raw confidence from Agent B (0–50). Zero if agentB unavailable.
    },
    penaltyApplied: {
      type:    Number,
      default: 0
      // Absolute point deduction when agreement=false.
      // e.g. raw=64, ×0.70=44.8→45; penaltyApplied = 64 - 45 = 19.
      // Zero if agreement=true or agentB unavailable.
    }
  }
}, { _id: false });

// ── Chart snapshot sub-document ───────────────────────────────────────────────
const chartSnapshotSchema = new mongoose.Schema({
  priceAtAnalysis: { type: Number }, // Closing price at analysis time
  rsi14:           { type: Number }, // RSI-14 value (>70 overbought, <30 oversold)
  macdHistogram:   { type: Number }, // MACD Line - Signal Line (positive = bullish)
  sma20:           { type: Number }  // SMA-20 (close > sma20 = bullish signal)
}, { _id: false });

// ── Main schema ───────────────────────────────────────────────────────────────
const analysisLogSchema = new mongoose.Schema({

  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true
    // Links log to the user who triggered analysis.
    // Used by GET /api/agent/history to filter per-user results.
  },

  symbol: {
    type:      String,
    required:  true,
    uppercase: true,
    trim:      true
    // e.g. 'RELIANCE.NS', 'AAPL', 'INFY.NS'
    // Uppercase enforced — 'reliance.ns' and 'RELIANCE.NS' treated the same.
  },

  sector: {
    type: String
    // e.g. 'Energy', 'Technology', 'Financial Services'
    // Passed to Agent B's RAG query for sector-relevant macro context.
    // Sourced from yfinance ticker.info.sector.
  },

  timestamp: {
    type:    Date,
    default: Date.now
    // When the analysis was triggered. Used for newest-first sorting in history.
  },

  agentBAvailable: {
    type:    Boolean,
    default: true
    // false = no PDFs uploaded, or Pinecone unreachable at analysis time.
    // When false: Agent B fallback defaults (confidence=0, sentiment='neutral').
    // Frontend uses this to show "No macro context — upload a PDF" note.
  },

  agentA:        { type: agentASchema,        required: true },
  agentB:        { type: agentBSchema,        required: true },
  agentC:        { type: agentCSchema,        required: true },
  chartSnapshot: { type: chartSnapshotSchema, required: true },

  latencyMs: {
    type:     Number,
    required: true
    // Total wall-clock ms for the full A+B+C pipeline.
    // PRD §6.1 target: <10,000ms. Acceptable: <15,000ms.
  },

  modelUsed: {
    type:    String,
    default: 'gemini-2.5-flash'
    // Which Gemini model processed Agents A, B, and C.
    // Updated from schema default 'gemini-1.5-flash' to match our NVIDIA NIM migration.
  }

});

// ── Indexes ───────────────────────────────────────────────────────────────────
// Primary: all analyses for user X, newest first (history feed)
analysisLogSchema.index({ userId: 1, timestamp: -1 });

// Secondary: all analyses for user X on symbol Y (ticker-filtered history)
analysisLogSchema.index({ userId: 1, symbol: 1, timestamp: -1 });

export default mongoose.model('AnalysisLog', analysisLogSchema);
