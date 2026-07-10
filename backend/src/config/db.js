import dns from 'dns';
import mongoose from 'mongoose';

// ── DNS override — fixes Airtel ISP DNS interception ─────────────────────────
// Airtel (both WiFi and mobile hotspot) intercepts DNS queries at the OS level,
// which causes the MongoDB Atlas SRV record lookup to return NXDOMAIN even when
// specifying 8.8.8.8 via PowerShell. Setting servers on Node.js's own dns
// module bypasses this OS-level interception entirely.
// Safe on all networks — falls back automatically if Google DNS is unreachable.
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

/**
 * connectDB — establishes a Mongoose connection to MongoDB Atlas.
 *
 * Called once at server startup from index.js.
 * If the connection fails, the process exits immediately — the backend
 * is useless without the database, so there is no point continuing.
 *
 * Connection options:
 *   maxPoolSize: 10          — max concurrent DB connections
 *   serverSelectionTimeoutMS: 5000  — give up connecting after 5 seconds
 *   socketTimeoutMS: 45000   — close idle sockets after 45 seconds
 *
 * Architecture Doc §3.1 (config/db.js)
 */
export async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }
}
