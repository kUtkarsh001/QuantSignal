import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { connectDB } from './config/db.js';

// ── Route imports ─────────────────────────────────────────────────────────────
import authRoutes   from './routes/auth.js';
import marketRoutes from './routes/market.js';
import userRoutes   from './routes/user.js';
import ragRoutes    from './routes/rag.js';

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Rate Limiter — POST /api/agent/analyze only ───────────────────────────────
// Architecture §9.2: 10 requests per minute per user (identified by JWT userId).
// Applied here before the route is mounted so it is ready when Day 13 wires it up.
export const analyzeLimiter = rateLimit({
  windowMs:         60 * 1000,  // 1 minute window
  max:              10,          // 10 requests per window
  standardHeaders:  true,
  legacyHeaders:    false,
  keyGenerator:     (req) => req.user?.id || req.ip,  // per-user, not per-IP
  message: {
    success: false,
    error: {
      code:    'RATE_LIMIT_EXCEEDED',
      message: 'Too many analysis requests. Limit is 10 per minute. Please wait.'
    }
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',   authRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/user',   userRoutes);
app.use('/api/rag',    ragRoutes);
// /api/agent will be mounted on Day 13 — analyzeLimiter applied there

// ── Health check — no auth required ──────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status:  'ok',
    version: '2.0.0',
    uptime:  process.uptime(),
    dependencies: {
      mongodb: 'connected'
    }
  });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[GlobalError]', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: {
      code:    err.code || 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred.'
    }
  });
});

// ── Start server ──────────────────────────────────────────────────────────────
async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start();
