import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getProfile } from '../controllers/userController.js';

const router = Router();

// GET /api/user/profile — API Spec §GET /api/user/profile
router.get('/profile', authMiddleware, getProfile);

export default router;
