import mongoose from 'mongoose';

/**
 * users collection — DB Schema §Collection 1
 *
 * Stores authentication credentials only.
 * No watchlist, no preferences, no isVerified — clean and minimal.
 *
 * Fields:
 *   email        — unique, lowercase, trimmed. Index enforced at DB level.
 *   passwordHash — bcrypt hash (cost 12). NEVER store plaintext.
 *   displayName  — optional. shown in Navbar greeting.
 *   createdAt    — set once on registration, never updated.
 */
const userSchema = new mongoose.Schema({
  email: {
    type:      String,
    required:  [true, 'Email is required'],
    unique:    true,
    lowercase: true,
    trim:      true,
    match:     [/^\S+@\S+\.\S+$/, 'Invalid email format']
  },
  passwordHash: {
    type:     String,
    required: [true, 'Password hash is required']
  },
  displayName: {
    type:      String,
    trim:      true,
    maxlength: [60, 'Display name cannot exceed 60 characters'],
    default:   ''
  },
  createdAt: {
    type:    Date,
    default: Date.now
  }
});

export default mongoose.model('User', userSchema);
