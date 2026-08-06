const express = require('express');
const prisma = require('../prisma');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// GET /api/projects — every project, since nothing in this schema models a
// "deny": Membership/SongRoleOverride only ever grant a role, they never
// restrict one below the instance default. Every user already has some
// role on every project, so listing all of them is the honest behavior
// here, not a shortcut around access control that doesn't actually exist.
router.get('/projects', requireAuth, async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, caption: true, kind: true, updatedAt: true },
    });
    res.json(projects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching projects.' });
  }
});

// GET /api/projects/:projectId — the nested tree the frontend's project view
// needs: songs, each song's tracks with their current take (not full take
// history — that's GET /tracks/:trackId/takes, fetched lazily when a track
// is expanded), and each song's current mix.
router.get('/projects/:projectId', requireAuth, async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.projectId },
      include: {
        songs: {
          orderBy: { createdAt: 'asc' },
          include: {
            tracks: {
              orderBy: { createdAt: 'asc' },
              include: {
                currentTake: { select: { id: true, takeNumber: true } },
                _count: { select: { takes: true } },
              },
            },
            currentMix: { select: { id: true, mixNumber: true, status: true } },
          },
        },
      },
    });

    if (!project) {
      return res
        .status(404)
        .json({ error: `No project found with id ${req.params.projectId}.` });
    }

    res.json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching the project.' });
  }
});

module.exports = router;
