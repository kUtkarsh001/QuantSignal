/**
 * routes/agent.js — Agent analysis routes
 * Day 13: POST /api/agent/analyze
 * Day 14: GET  /api/agent/history
 *
 * Auth middleware applied to all routes.
 * Rate limiter (10 req/min per user) applied to POST /analyze.
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth.js';
import { analyze, getHistory } from '../controllers/agentController.js';

const router = express.Router();

// ── Rate limiter — POST /analyze only ────────────────────────────────────────
// Architecture §9.2: 10 requests per minute, keyed by JWT userId.
// Defined here (not in index.js) to avoid circular imports.
const analyzeLimiter = rateLimit({
  windowMs:        60 * 1000,  // 1 minute window
  max:             10,          // 10 requests per window per key
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    (req) => req.user?.id || req.ip,  // per-user, not per-IP
  message: {
    success: false,
    error: {
      code:    'RATE_LIMIT_EXCEEDED',
      message: 'Too many analysis requests. Limit is 10 per minute. Please wait.'
    }
  }
});

// ── POST /api/agent/analyze ───────────────────────────────────────────────────
// Full multi-agent analysis pipeline (Architecture §6.4).
// Auth + rate limit applied.
// Body: { symbol: string }
router.post('/analyze', authMiddleware, analyzeLimiter, analyze);

// ── GET /api/agent/history ────────────────────────────────────────────────────
// Paginated analysis history for the authenticated user (Day 14).
// Query: ?page=1&limit=10&symbol=RELIANCE.NS
router.get('/history', authMiddleware, getHistory);

export default router;
