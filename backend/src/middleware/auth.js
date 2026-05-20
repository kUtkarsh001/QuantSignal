import jwt from 'jsonwebtoken';

/**
 * authMiddleware — Architecture §8
 *
 * Verifies the JWT Bearer token on every protected route.
 * If valid, attaches the decoded payload to req.user and calls next().
 * If missing or invalid, returns 401 immediately — request goes no further.
 *
 * Usage: apply to any route that requires login.
 *   router.get('/protected', authMiddleware, controller)
 */
export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  // Check header exists and starts with 'Bearer '
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        code:    'UNAUTHORIZED',
        message: 'Missing or invalid authorization token.'
      }
    });
  }

  try {
    const token = header.split(' ')[1];
    // jwt.verify throws if token is expired or signature is wrong
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      success: false,
      error: {
        code:    'INVALID_TOKEN',
        message: 'Token is expired or invalid. Please log in again.'
      }
    });
  }
}
