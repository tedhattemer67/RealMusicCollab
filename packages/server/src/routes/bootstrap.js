const express = require('express');
const bcrypt = require('bcryptjs');
const { Prisma } = require('@prisma/client');
const prisma = require('../prisma');
const { SESSION_COOKIE_NAME, SESSION_DURATION_MS, getSessionCookieOptions } = require('../constants');
const { generateSecureToken } = require('../lib/tokens');
const { authLimiter } = require('../middleware/rateLimit');
const { isValidEmail } = require('../lib/validation');

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
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'That email address does not look valid.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // count-then-create had a gap: two bootstrap requests landing close
    // together could both see zero users and both create an ADMIN. A
    // Serializable transaction makes Postgres detect that read-then-write
    // conflict and abort the loser instead, rather than silently minting
    // two instance admins.
    const ALREADY_BOOTSTRAPPED = Symbol('already-bootstrapped');
    let user;
    try {
      user = await prisma.$transaction(
        async (tx) => {
          const userCount = await tx.user.count();
          if (userCount > 0) throw ALREADY_BOOTSTRAPPED;
          return tx.user.create({
            data: { name, email, passwordHash, instanceRole: 'ADMIN' },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (e) {
      // P2034 is Prisma's code for a serialization failure — the loser of
      // the race described above. Same practical outcome as the plain
      // count check losing, so it gets the same friendly response.
      if (e === ALREADY_BOOTSTRAPPED || (e && e.code === 'P2034')) {
        return res.status(409).json({
          error: 'This instance already has an account — setup is no longer available.',
        });
      }
      throw e;
    }

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
