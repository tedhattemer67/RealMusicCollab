const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../prisma');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { hasProjectAccess } = require('../lib/roles');
const { SESSION_COOKIE_NAME } = require('../constants');

const router = express.Router();

// GET /api/users
//   ?projectId=<id>  -> the members of that project (id + name only), for the
//                       performer / assignee pickers. Any member of that
//                       project (or an instance admin) may read it.
//   no query param   -> every active user, for the instance admin's
//                       "add someone to a project" search. Instance ADMIN only
//                       now — with per-project isolation, one band shouldn't
//                       get the full account list of the whole instance.
router.get('/users', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.query;

    if (projectId) {
      const allowed =
        req.user.instanceRole === 'ADMIN' ||
        (await hasProjectAccess(req.user.id, { projectId }));
      if (!allowed) {
        return res.status(404).json({ error: 'Not found.' });
      }
      const memberships = await prisma.membership.findMany({
        where: { projectId, user: { active: true } },
        orderBy: { user: { name: 'asc' } },
        select: { user: { select: { id: true, name: true } }, role: true },
      });
      return res.json(
        memberships.map((m) => ({ id: m.user.id, name: m.user.name, role: m.role }))
      );
    }

    if (req.user.instanceRole !== 'ADMIN') {
      return res.status(403).json({ error: 'This action requires one of: ADMIN.' });
    }
    const users = await prisma.user.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, instanceRole: true },
    });
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching users.' });
  }
});

// PATCH /api/users/me/password — self-service change, requires proving you
// know the current password first.
// body: { currentPassword, newPassword }
router.patch('/users/me/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are both required.' });
    }
    if (!req.user.passwordHash) {
      return res.status(400).json({ error: 'No password set for this account yet.' });
    }

    const passwordMatches = await bcrypt.compare(currentPassword, req.user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash } });

    // A password change should sign out every OTHER session for this
    // account (a shared machine, an old logged-in device) — but not the
    // one making this request, which would otherwise self-log-out the
    // person who just proved they know the new password.
    const currentSessionId = req.cookies[SESSION_COOKIE_NAME];
    await prisma.session.updateMany({
      where: { userId: req.user.id, revokedAt: null, id: { not: currentSessionId } },
      data: { revokedAt: new Date() },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong changing the password.' });
  }
});

// PATCH /api/users/:userId/password — Admin sets a new password directly for
// someone else, no proof of the old one required.
// body: { newPassword }
router.patch(
  '/users/:userId/password',
  requireAuth,
  requireRole(['ADMIN'], () => ({})),
  async (req, res) => {
    try {
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
      }

      const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
      if (!user) {
        return res.status(404).json({ error: `No user found with id ${req.params.userId}.` });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

      // An admin-initiated reset is often a response to a compromised or
      // departing account — leaving that user's existing sessions live
      // would defeat the point. Unlike the self-service change above,
      // there's no "current session" of theirs to preserve here.
      await prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong resetting the password.' });
    }
  }
);

module.exports = router;
