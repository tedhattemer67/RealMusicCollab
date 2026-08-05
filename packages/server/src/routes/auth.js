const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../prisma');
const requireAuth = require('../middleware/requireAuth');
const { SESSION_COOKIE_NAME } = require('../constants');

const router = express.Router();

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// POST /api/login
// body: { email, password }
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are both required.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Same message whether the email doesn't exist or the password is wrong —
    // distinguishing those two cases is exactly what lets someone probe for
    // which emails have accounts here.
    const invalidMessage = 'Incorrect email or password.';

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: invalidMessage });
    }
    if (!user.active) {
      return res.status(403).json({ error: 'This account has been deactivated.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: invalidMessage });
    }

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      },
    });

    res.cookie(SESSION_COOKIE_NAME, session.id, {
      httpOnly: true,
      sameSite: 'lax',
      // secure: true belongs here once this runs over HTTPS (e.g. on Render) —
      // left off for now since local dev is plain http and browsers would
      // silently refuse to send a secure cookie back over http.
      maxAge: SESSION_DURATION_MS,
    });

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      instanceRole: user.instanceRole,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong logging in.' });
  }
});

// POST /api/logout
router.post('/logout', async (req, res) => {
  try {
    const sessionId = req.cookies[SESSION_COOKIE_NAME];
    if (sessionId) {
      // updateMany rather than update: silently affects 0 rows if the
      // session id is missing/already revoked, instead of throwing —
      // logging out should never error just because there's nothing to undo.
      await prisma.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    res.clearCookie(SESSION_COOKIE_NAME);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong logging out.' });
  }
});

// GET /api/me — the simplest possible proof the middleware works: returns
// whoever the session cookie actually belongs to, straight from the database.
router.get('/me', requireAuth, (req, res) => {
  res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    instanceRole: req.user.instanceRole,
  });
});

module.exports = router;
