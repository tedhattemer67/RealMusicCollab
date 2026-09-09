const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../prisma');
const { SESSION_COOKIE_NAME, SESSION_DURATION_MS, getSessionCookieOptions } = require('../constants');
const { generateSecureToken } = require('../lib/tokens');
const { authLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// GET /api/bootstrap — tells the frontend whether first-admin setup is still
// available. True only when the instance genuinely has zero users — every
// other account-creation path (invite redemption) requires an existing
// Admin, which is impossible on a fresh database. This is what makes
// self-hosting this app approachable without needing to run a script by hand.
router.get('/bootstrap', async (req, res) => {
  try {
    const userCount = await prisma.user.count();
    res.json({ available: userCount === 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong checking setup status.' });
  }
});

// POST /api/bootstrap — creates the very first Admin account. Refuses if
// any account already exists, checked again right before creating (not just
// trusting whatever the GET check returned earlier) so this can never be
// used to create a second, unintended Admin. Auto-logs in afterward, same
// as invite redemption.
router.post('/bootstrap', authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are all required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return res.status(409).json({
        error: 'This instance already has an account — setup is no longer available.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, instanceRole: 'ADMIN' },
    });

    const session = await prisma.session.create({
      data: {
        id: generateSecureToken(),
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      },
    });
    res.cookie(SESSION_COOKIE_NAME, session.id, getSessionCookieOptions());

    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      instanceRole: user.instanceRole,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the first account.' });
  }
});

module.exports = router;
