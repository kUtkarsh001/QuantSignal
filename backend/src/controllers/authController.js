import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Helper — signs a JWT for a given user document.
 * Token payload: { id, email }
 * Expires: JWT_EXPIRES_IN from .env (7d)
 */
function signToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

/**
 * register — POST /api/auth/register
 * DB Schema §Collection 1 — authController block
 *
 * Flow:
 *   1. Validate input (email, password present, password >= 8 chars)
 *   2. Check if email already exists → 409
 *   3. bcrypt.hash(password, 12) → passwordHash
 *   4. User.create({ email, passwordHash, displayName })
 *   5. Sign JWT
 *   6. Return { success, token, user: { id, email, displayName } }
 */
export async function register(req, res, next) {
  try {
    const { email, password, displayName } = req.body;

    // ── Input validation ──────────────────────────────────────────────────────
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email and password are required.' }
      });
    }
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters.' }
      });
    }

    // ── Duplicate check ───────────────────────────────────────────────────────
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: { code: 'EMAIL_IN_USE', message: 'An account with this email already exists.' }
      });
    }

    // ── Create user ───────────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      email,
      passwordHash,
      displayName: displayName || ''
    });

    // ── Sign and return JWT ───────────────────────────────────────────────────
    const token = signToken(user);

    res.status(201).json({
      success: true,
      token,
      user: {
        id:          user._id,
        email:       user.email,
        displayName: user.displayName
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * login — POST /api/auth/login
 * DB Schema §Collection 1 — authController block
 *
 * Flow:
 *   1. Validate input
 *   2. Find user by email → 401 if not found
 *   3. bcrypt.compare(password, hash) → 401 if false
 *   4. Sign JWT
 *   5. Return { success, token, user }
 */
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    // ── Input validation ──────────────────────────────────────────────────────
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email and password are required.' }
      });
    }

    // ── Find user ─────────────────────────────────────────────────────────────
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' }
      });
    }

    // ── Verify password ───────────────────────────────────────────────────────
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' }
      });
    }

    // ── Sign and return JWT ───────────────────────────────────────────────────
    const token = signToken(user);

    res.status(200).json({
      success: true,
      token,
      user: {
        id:          user._id,
        email:       user.email,
        displayName: user.displayName
      }
    });
  } catch (err) {
    next(err);
  }
}
