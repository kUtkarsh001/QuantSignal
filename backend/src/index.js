import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';

// ── Route imports ─────────────────────────────────────────────────────────────
import authRoutes from './routes/auth.js';

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

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
