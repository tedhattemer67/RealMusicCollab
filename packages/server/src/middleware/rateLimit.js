// Rate limiters for endpoints an attacker can hit without (or before)
// authentication: login, first-admin bootstrap, and invite redemption.
// Also a looser limiter for the export/archive routes, which are
// requireAuth-gated but expensive (build a ZIP server-side) and worth
// bounding per caller regardless.
const rateLimit = require('express-rate-limit');

// The integration suite fires several login/redeem-shaped requests in a
// shared process against 127.0.0.1 — nothing here is testing rate-limit
// behavior itself, so skip it under test rather than tune limits around it.
const skip = () => process.env.NODE_ENV === 'test';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: 'Too many export requests. Please wait a few minutes and try again.' },
});

module.exports = { authLimiter, exportLimiter };
