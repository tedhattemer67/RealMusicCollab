const express = require('express');
const prisma = require('../prisma');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

// Not Viewer, not Reviewer — only Admin and Contributor can create.
// (Flagged as a judgment call: creating a brand-new Project could arguably
// be Admin-only instead, since it's a bigger action than adding to an
// existing one — defaulting to consistency with everything else for now.)
const UPLOADER_ROLES = ['ADMIN', 'CONTRIBUTOR'];

// GET /api/projects — every project, since nothing in this schema models a
// "deny": Membership/SongRoleOverride only ever grant a role, they never
// restrict one below the instance default. Every user already has some
// role on every project, so listing all of them is the honest behavior
// here, not a shortcut around access control that doesn't actually exist.
router.get('/projects', requireAuth, async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      where: { hidden: false },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, caption: true, kind: true, updatedAt: true },
    });
    res.json(projects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching projects.' });
  }
});

// GET /api/projects/all — every project, hidden included, for the Manage
// Projects admin tab. Must stay registered here, before GET /projects/:projectId
// below — that route's :projectId segment would otherwise swallow "all" as
// a literal id, since Express matches routes in registration order.
router.get(
  '/projects/all',
  requireAuth,
  requireRole(['ADMIN'], () => ({})),
  async (req, res) => {
    try {
      const projects = await prisma.project.findMany({
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          caption: true,
          kind: true,
          updatedAt: true,
          hidden: true,
          hiddenAt: true,
        },
      });
      res.json(projects);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong fetching projects.' });
    }
  }
);

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

// POST /api/projects
// body: { name, caption?, kind? }
router.post('/projects', requireAuth, requireRole(UPLOADER_ROLES, () => ({})), async (req, res) => {
  try {
    const { name, caption, kind } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required.' });
    }
    const validKinds = ['SINGLE', 'EP', 'LP', 'OTHER'];
    if (kind && !validKinds.includes(kind)) {
      return res.status(400).json({ error: `kind must be one of: ${validKinds.join(', ')}` });
    }

    const project = await prisma.project.create({
      data: { name, caption: caption || null, kind: kind || 'OTHER' },
    });
    res.status(201).json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the project.' });
  }
});

// POST /api/projects/:projectId/songs
// body: { title }
// Unlike a Track, a new Song doesn't need a bundled first take — Song has
// no nullable-FK "never observably empty" constraint the way Track's
// currentTakeId does. A song with zero tracks yet is a perfectly normal state.
router.post('/projects/:projectId/songs', requireAuth, requireRole(UPLOADER_ROLES, (req) => ({ projectId: req.params.projectId })), async (req, res) => {
  try {
    const { projectId } = req.params;
    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'title is required.' });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ error: `No project found with id ${projectId}.` });
    }

    const song = await prisma.song.create({ data: { projectId, title } });
    res.status(201).json(song);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the song.' });
  }
});

// PATCH /api/projects/:projectId — Admin-only hide/unhide toggle for the
// Manage Projects tab. Hiding only removes a project from GET /projects'
// normal list — it doesn't restrict GET /projects/:projectId itself, so a
// direct link still works for anyone who already has it. That's deliberate:
// this is a list-visibility toggle, not an access-control feature.
// body: { hidden }
router.patch(
  '/projects/:projectId',
  requireAuth,
  requireRole(['ADMIN'], (req) => ({ projectId: req.params.projectId })),
  async (req, res) => {
    try {
      const { hidden } = req.body;
      if (typeof hidden !== 'boolean') {
        return res.status(400).json({ error: 'hidden must be a boolean.' });
      }

      const existing = await prisma.project.findUnique({ where: { id: req.params.projectId } });
      if (!existing) {
        return res
          .status(404)
          .json({ error: `No project found with id ${req.params.projectId}.` });
      }

      const project = await prisma.project.update({
        where: { id: req.params.projectId },
        data: { hidden, hiddenAt: hidden ? new Date() : null },
      });
      res.json(project);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong updating the project.' });
    }
  }
);
