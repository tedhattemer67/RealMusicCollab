const prisma = require('../prisma');
const { SESSION_COOKIE_NAME } = require('../constants');

// Apply this to any route that needs to know who's actually making the
// request — it reads the session cookie, looks up the real Session +
// User in the database, and attaches the verified user as req.user.
// Routes using this should read req.user.id instead of trusting any
// "userId"-shaped field the client might send in the request body.
async function requireAuth(req, res, next) {
  try {
    const sessionId = req.cookies[SESSION_COOKIE_NAME];
    if (!sessionId) {
      return res.status(401).json({ error: 'Not logged in.' });
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Session is invalid or expired.' });
    }
    if (!session.user.active) {
      return res.status(403).json({ error: 'This account has been deactivated.' });
    }

    req.user = session.user;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong checking authentication.' });
  }
}

module.exports = requireAuth;
