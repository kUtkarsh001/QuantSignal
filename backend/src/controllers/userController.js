import User from '../models/User.js';

/**
 * getProfile — GET /api/user/profile
 * API Spec §GET /api/user/profile
 *
 * Returns the logged-in user's profile data.
 * req.user is populated by authMiddleware (contains id + email from JWT).
 * We fetch from MongoDB to include displayName and createdAt.
 *
 * Never return passwordHash — select it out explicitly.
 */
export async function getProfile(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User account not found.' }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id:          user._id,
        email:       user.email,
        displayName: user.displayName,
        createdAt:   user.createdAt
      }
    });
  } catch (err) {
    next(err);
  }
}
