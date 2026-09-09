const express = require('express');
const prisma = require('../prisma');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { MEMBER_ROLES, UPLOADER_ROLES, canSeeDraftTakes } = require('../lib/roles');

const router = express.Router();

// GET /api/projects — the projects this user can actually see. Instance
// ADMINs get every non-hidden project (they operate the instance); everyone
// else gets only the projects they hold a Membership on. This is the list
// counterpart to the per-route membership checks — a non-member never learns
// another band's project exists.
router.get('/projects', requireAuth, async (req, res) => {
  try {
    const isInstanceAdmin = req.user.instanceRole === 'ADMIN';
    const projects = await prisma.project.findMany({
      where: {
        hidden: false,
        ...(isInstanceAdmin ? {} : { memberships: { some: { userId: req.user.id } } }),
      },
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
router.get('/projects/:projectId', requireAuth, requireRole(MEMBER_ROLES, (req) => ({ projectId: req.params.projectId }), { notFoundOnNoAccess: true }), async (req, res) => {
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
                currentTake: { select: { id: true, takeNumber: true, readyForFeedback: true } },
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

    // An Admin's own draft upload still auto-promotes to currentTakeId (see
    // takes.js) — strip that pointer out here for roles that can't see
    // drafts, same as the takes list and stream routes, so "current take"
    // doesn't leak a draft's existence/number to a Reviewer/Viewer.
    if (!canSeeDraftTakes(req.effectiveRole)) {
      for (const song of project.songs) {
        for (const track of song.tracks) {
          if (track.currentTake && !track.currentTake.readyForFeedback) {
            track.currentTake = null;
          }
        }
      }
    }

    // The caller's effective role for this project, so the client can show
    // only the affordances they can actually use. Set by requireRole above.
    res.json({ ...project, myRole: req.effectiveRole });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching the project.' });
  }
});

module.exports = router;

// POST /api/projects — instance-ADMIN only. The empty scope means only an
// instance admin clears requireRole; a plain instanceRole is no longer a grant.
// body: { name, caption?, kind? }
router.post('/projects', requireAuth, requireRole(['ADMIN'], () => ({})), async (req, res) => {
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
  // Instance-ADMIN only — this is a Manage Projects (instance settings) action,
  // not something a project's own admin does.
  requireRole(['ADMIN'], () => ({})),
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
