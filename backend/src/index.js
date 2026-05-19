import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Health check — no auth required ──────────────────────────────────────────
// Called by Render's monitoring every 30 seconds to verify the server is alive.
// Also used to confirm MongoDB and future Pinecone connectivity (§9 Architecture).
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    version: '2.0.0',
    uptime: process.uptime(),
    dependencies: {
      mongodb: 'connected'   // will be dynamic in later days
    }
  });
});

// ── Global error handler ──────────────────────────────────────────────────────
// Catches any error passed to next(err) from controllers.
// Returns a consistent error envelope (API Spec §Standard Error Envelope).
app.use((err, req, res, next) => {
  console.error('[GlobalError]', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
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
