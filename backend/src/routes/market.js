import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getQuote, getIndicators } from '../controllers/marketController.js';

const router = Router();

// All market routes require authentication
router.use(authMiddleware);

// GET /api/market/quote?symbol=RELIANCE.NS&period=1mo&interval=1d
// API Spec §GET /api/market/quote
router.get('/quote', getQuote);

// GET /api/market/indicators?symbol=RELIANCE.NS&period=1mo&interval=1d
// API Spec §GET /api/market/indicators
router.get('/indicators', getIndicators);

export default router;
