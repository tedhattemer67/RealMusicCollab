const express = require('express');
const prisma = require('../prisma');
const requireAuth = require('../middleware/requireAuth');

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

module.exports = router;
