/**
 * agentController.js — Multi-Agent Orchestration
 * Architecture §6.4 (full orchestration code)
 *
 * POST /api/agent/analyze
 *   1. Fetch market data + compute all DSP indicators via getEnrichedData()
 *   2. Query Pinecone RAG for macro context (graceful fallback if no documents)
 *   3. Run Agent A and Agent B in PARALLEL via Promise.allSettled
 *      — one failure must not crash the other (Architecture §1.1)
 *   4. Run Agent C with A+B outputs → qualitative agreement/conflict decision
 *   5. Compute confidenceScore SERVER-SIDE (never by Gemini — Architecture §6.5)
 *   6. Write AnalysisLog to MongoDB
 *   7. Return full response
 *
 * GET /api/agent/history  (Day 14)
 *   Returns paginated analysis history for the authenticated user.
 *
 * CRITICAL RULES (Build Plan §Critical Rules):
 *   - Promise.allSettled for A+B — never Promise.all
 *   - safeParseJSON always — never JSON.parse() directly on LLM output
 *   - confidenceScore computed here in server code — never by Agent C
 *   - getBollingerPosition() from filters.js — never hardcode 'middle'
 */

import { getEnrichedData }        from '../services/marketService.js';
import { queryKnowledgeBase }     from '../services/ragService.js';
import { getBollingerPosition }   from '../dsp/filters.js';
import { agentAChain }            from '../agents/agentA.js';
import { agentBChain }            from '../agents/agentB.js';
import { agentCChain }            from '../agents/agentC.js';
import AnalysisLog                from '../models/AnalysisLog.js';

// ── Safe JSON parser ──────────────────────────────────────────────────────────
// Gemini sometimes wraps JSON output in ```json ... ``` fences even when
// the prompt says not to. JSON.parse() throws a SyntaxError on those fences,
// crashing the entire analysis. This helper strips fences before parsing
// and returns a safe fallback value if parsing still fails.
// Architecture §6.4 — safeParseJSON helper
function safeParseJSON(raw, fallback) {
  try {
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    return JSON.parse(cleaned);
  } catch {
    console.error('[safeParseJSON] Failed to parse LLM output:', raw?.slice(0, 200));
    return fallback;
  }
}

/**
 * analyze — POST /api/agent/analyze
 * Architecture §6.4 full orchestration flow.
 */
export async function analyze(req, res, next) {
  try {
    const { symbol } = req.body;
    const userId     = req.user.id;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: '`symbol` is required in request body.' }
      });
    }

    const startTime = Date.now();

    // ── Step 1: Fetch market data + compute all DSP indicators ───────────────
    let marketData;
    try {
      marketData = await getEnrichedData(symbol.toUpperCase());
    } catch (err) {
      if (err.message.toLowerCase().includes('not found') ||
          err.message.toLowerCase().includes('no data')) {
        return res.status(404).json({
          success: false,
          error: { code: 'TICKER_NOT_FOUND', message: `Symbol '${symbol}' not found or no market data available.` }
        });
      }
      throw err;
    }

    const { candles, indicators, sector } = marketData;
    const closes          = candles.map(c => c.close);
    const latestRSI       = indicators.rsi14.at(-1);
    const latestMACDHist  = indicators.macdHistogram.at(-1);
    const latestSMA20     = indicators.sma20.at(-1);
    const latestClose     = closes.at(-1);
    const latestBollUpper = indicators.bollinger.upper.at(-1);
    const latestBollLower = indicators.bollinger.lower.at(-1);

    // Use getBollingerPosition() — never hardcode 'middle' (Critical Rule #7)
    const bollingerPos = getBollingerPosition(latestClose, latestBollUpper, latestBollLower);

    // ── Step 2: RAG query for macro context ──────────────────────────────────
    // queryKnowledgeBase uses namespace(`user-${userId}`) internally (§5.4).
    // .catch(() => null) is the graceful fallback when Pinecone fails or
    // the user has no documents uploaded — Agent B will use the fallback text.
    const ragContext = await queryKnowledgeBase(
      `macroeconomic outlook interest rates ${sector}`,
      userId
    ).catch(() => null);

    // ── Step 3: Agent A + Agent B in PARALLEL ────────────────────────────────
    // Promise.allSettled — one failure must not crash the other (§1.1)
    const [resultA, resultB] = await Promise.allSettled([
      agentAChain.invoke({
        symbol,
        rsi:                latestRSI?.toFixed(1)  ?? 'N/A',
        macd_hist:          latestMACDHist?.toFixed(2) ?? 'N/A',
        price_vs_sma20:     latestSMA20 ? (latestClose > latestSMA20 ? 'above' : 'below') : 'N/A',
        bollinger_position: bollingerPos   // real value from getBollingerPosition()
      }),
      agentBChain.invoke({
        sector,
        rag_context: ragContext?.answer ?? 'No documents available in knowledge base.'
      })
    ]);

    // safeParseJSON strips markdown fences before parsing (Critical Rule #3)
    const agentAResult = resultA.status === 'fulfilled'
      ? safeParseJSON(resultA.value.content,
          { trend: 'neutral', strength: 25, reasoning: 'Agent A parse failed.' })
      : { trend: 'neutral', strength: 25, reasoning: 'Agent A invocation failed.' };

    const agentBRaw = resultB.status === 'fulfilled'
      ? safeParseJSON(resultB.value.content,
          { sentiment: 'neutral', evidence: 'Agent B parse failed.', confidence: 0 })
      : { sentiment: 'neutral', evidence: 'No relevant documents found in knowledge base.', confidence: 0 };

    // Guarantee evidence is always a non-empty string (AnalysisLog schema: required: true)
    const agentBResult = {
      sentiment:  agentBRaw.sentiment  || 'neutral',
      evidence:   agentBRaw.evidence   || 'No relevant information found in your uploaded documents for this query.',
      confidence: agentBRaw.confidence ?? 0,
    };

    // agentBAvailable = false when confidence=0 (fallback) or invocation failed
    const agentBAvailable = resultB.status === 'fulfilled' && agentBResult.confidence > 0;

    // ── Step 4: Agent C — qualitative judgement only (agreement + reasoning) ─
    // Agent C does NOT compute confidenceScore — that is done below (Critical Rule #5)
    const agentCRaw = await agentCChain.invoke({
      agent_a_output:    JSON.stringify(agentAResult),
      agent_b_output:    JSON.stringify(agentBResult),
      agent_b_available: agentBAvailable
    });
    const agentCPartial = safeParseJSON(agentCRaw.content, {
      agreement:   true,
      conflictFlag: null,
      reasoning:   'Agent C parse failed. Score based on raw indicator data only.'
    });

    // ── Step 5: Compute confidenceScore SERVER-SIDE ───────────────────────────
    // Architecture §6.5 — fixed formula, code guarantee not LLM wish
    //   agreement=true:    score = agentA.strength + agentB.confidence
    //   agreement=false:   score = round((agentA.strength + agentB.confidence) × 0.70)
    //   agentB unavail:    score = agentA.strength × 2
    const rawScore = agentAResult.strength + agentBResult.confidence;
    let confidenceScore;

    if (!agentBAvailable) {
      confidenceScore = Math.min(agentAResult.strength * 2, 100);
    } else if (agentCPartial.agreement) {
      confidenceScore = Math.min(rawScore, 100);
    } else {
      confidenceScore = Math.round(rawScore * 0.70);
    }

    const penaltyApplied = agentBAvailable ? rawScore - confidenceScore : 0;

    // Assemble final Agent C result with server-computed numbers
    const agentCResult = {
      ...agentCPartial,
      confidenceScore,
      scoreBreakdown: {
        agentAContribution: agentAResult.strength,
        agentBContribution: agentBResult.confidence,
        penaltyApplied
      }
    };

    // ── Step 6: Write to MongoDB ──────────────────────────────────────────────
    const latencyMs = Date.now() - startTime;
    const log = await AnalysisLog.create({
      userId,
      symbol:          symbol.toUpperCase(),
      sector,
      agentBAvailable,
      agentA:          agentAResult,
      agentB:          agentBResult,
      agentC:          agentCResult,
      chartSnapshot: {
        priceAtAnalysis: latestClose,
        rsi14:           latestRSI,
        macdHistogram:   latestMACDHist,
        sma20:           latestSMA20
      },
      latencyMs,
      modelUsed: 'gemini-2.5-flash'
    });

    // ── Step 7: Return full response ──────────────────────────────────────────
    res.status(200).json({
      success:        true,
      analysisId:     log._id,
      symbol:         symbol.toUpperCase(),
      agentBAvailable,
      agentA:         agentAResult,
      agentB:         agentBResult,
      agentC:         agentCResult,
      chartSnapshot:  log.chartSnapshot,
      latencyMs
    });

  } catch (err) {
    console.error('[agentController.analyze] Error:', err.message);
    next(err);
  }
}

/**
 * getHistory — GET /api/agent/history
 * Day 14 requirement — returns paginated analysis history for the user.
 * Architecture §GET /api/agent/history. DB Schema §Collection 2.
 *
 * Query params:
 *   page  (default 1)    — page number
 *   limit (default 10)   — items per page (max 50)
 *   symbol (optional)    — filter to a specific ticker
 */
export async function getHistory(req, res, next) {
  try {
    const userId = req.user.id;
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 10);
    const skip   = (page - 1) * limit;

    // Build filter — always scoped to the requesting user
    const filter = { userId };
    if (req.query.symbol) {
      filter.symbol = req.query.symbol.toUpperCase().trim();
    }

    const [logs, total] = await Promise.all([
      AnalysisLog
        .find(filter)
        .sort({ timestamp: -1 })         // newest first
        .skip(skip)
        .limit(limit)
        .select('symbol sector timestamp agentBAvailable agentA.trend agentC.confidenceScore agentC.agreement agentC.conflictFlag latencyMs'),
      AnalysisLog.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: {
        items: logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      }
    });

  } catch (err) {
    console.error('[agentController.getHistory] Error:', err.message);
    next(err);
  }
}

/**
 * getAnalysisById — GET /api/agent/history/:id
 * Day 14 — returns a single full analysis record.
 * Used by frontend to render a detailed view of a past analysis.
 *
 * Security: scoped to the requesting user — cannot read another user's logs.
 */
export async function getAnalysisById(req, res, next) {
  try {
    const userId = req.user.id;
    const { id }  = req.params;

    const log = await AnalysisLog.findOne({ _id: id, userId });

    if (!log) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Analysis record not found.' }
      });
    }

    res.status(200).json({ success: true, data: log });

  } catch (err) {
    console.error('[agentController.getAnalysisById] Error:', err.message);
    next(err);
  }
}
