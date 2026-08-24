const express = require('express');
const prisma = require('../prisma');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { recordEvent } = require('../lib/events');

const router = express.Router();

// Reviewer's whole purpose is approving; Admin and Contributor can too.
// Viewer is deliberately excluded — their role is listen/comment only.
const APPROVER_ROLES = ['ADMIN', 'REVIEWER', 'CONTRIBUTOR'];

// These resolve the Song a Take/Mix belongs to, so requireRole can check the
// three-tier cascade against the right scope — not available synchronously
// from the URL alone, hence the async extractScope support.
async function resolveSongIdForTake(req) {
  const take = await prisma.take.findUnique({
    where: { id: req.params.takeId },
    select: { track: { select: { songId: true } } },
  });
  return { songId: take ? take.track.songId : undefined };
}

async function resolveSongIdForMix(req) {
  const mix = await prisma.mix.findUnique({
    where: { id: req.params.mixId },
    select: { songId: true },
  });
  return { songId: mix ? mix.songId : undefined };
}

// POST /api/takes/:takeId/approvals
router.post(
  '/takes/:takeId/approvals',
  requireAuth,
  requireRole(APPROVER_ROLES, resolveSongIdForTake),
  async (req, res) => {
    try {
      const { takeId } = req.params;
      const take = await prisma.take.findUnique({
        where: { id: takeId },
        include: { track: { select: { name: true, song: { select: { title: true, projectId: true } } } } },
      });
      if (!take) {
        return res.status(404).json({ error: `No take found with id ${takeId}.` });
      }

      const approval = await prisma.approval.create({
        data: { takeId, userId: req.user.id },
      });

      await recordEvent({
        action: 'APPROVAL_GIVEN',
        actorId: req.user.id,
        entityType: 'Take',
        entityId: takeId,
        projectId: take.track.song.projectId,
        message: `${req.user.name} approved Take ${take.takeNumber} for "${take.track.name}" on "${take.track.song.title}".`,
      });

      res.status(201).json(approval);
    } catch (err) {
      if (err.code === 'P2002') {
        return res.status(409).json({ error: 'You have already approved this take.' });
      }
      console.error(err);
      res.status(500).json({ error: 'Something went wrong recording the approval.' });
    }
  }
);

// GET /api/takes/:takeId/approvals — who's signed off so far
router.get('/takes/:takeId/approvals', requireAuth, async (req, res) => {
  try {
    const approvals = await prisma.approval.findMany({
      where: { takeId: req.params.takeId },
      include: { user: { select: { id: true, name: true } } },
    });
    res.json(approvals);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching approvals.' });
  }
});

// POST /api/mixes/:mixId/approvals
router.post(
  '/mixes/:mixId/approvals',
  requireAuth,
  requireRole(APPROVER_ROLES, resolveSongIdForMix),
  async (req, res) => {
    try {
      const { mixId } = req.params;
      const mix = await prisma.mix.findUnique({
        where: { id: mixId },
        include: { song: { select: { title: true, projectId: true } } },
      });
      if (!mix) {
        return res.status(404).json({ error: `No mix found with id ${mixId}.` });
      }

      const approval = await prisma.approval.create({
        data: { mixId, userId: req.user.id },
      });

      await recordEvent({
        action: 'APPROVAL_GIVEN',
        actorId: req.user.id,
        entityType: 'Mix',
        entityId: mixId,
        projectId: mix.song.projectId,
        message: `${req.user.name} approved Mix v${mix.mixNumber} for "${mix.song.title}".`,
      });

      res.status(201).json(approval);
    } catch (err) {
      if (err.code === 'P2002') {
        return res.status(409).json({ error: 'You have already approved this mix.' });
      }
      console.error(err);
      res.status(500).json({ error: 'Something went wrong recording the approval.' });
    }
  }
);

// GET /api/mixes/:mixId/approvals
router.get('/mixes/:mixId/approvals', requireAuth, async (req, res) => {
  try {
    const approvals = await prisma.approval.findMany({
      where: { mixId: req.params.mixId },
      include: { user: { select: { id: true, name: true } } },
    });
    res.json(approvals);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching approvals.' });
  }
});

module.exports = router;
