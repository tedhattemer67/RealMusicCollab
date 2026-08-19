const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../prisma');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

// GET /api/users — everyone active, for picking a performer/assignee.
// Same "list everything, don't filter by project" honesty as GET /projects:
// nothing in this schema models restricting who a user can see, only
// granting roles, so there's no real access-control corner being cut here.
router.get('/users', requireAuth, async (req, res) => {
  try {
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

      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong resetting the password.' });
    }
  }
);

module.exports = router;
