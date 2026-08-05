const express = require('express');
const prisma = require('../prisma');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

// POST /api/songs/:songId/freeze — Admin only.
router.post(
  '/songs/:songId/freeze',
  requireAuth,
  requireRole(['ADMIN'], (req) => ({ songId: req.params.songId })),
  async (req, res) => {
    try {
      const { songId } = req.params;
      const song = await prisma.song.findUnique({ where: { id: songId } });
      if (!song) return res.status(404).json({ error: `No song found with id ${songId}.` });
      if (song.status === 'FROZEN') {
        return res.status(409).json({ error: 'This song is already frozen.' });
      }

      const updated = await prisma.song.update({
        where: { id: songId },
        data: { status: 'FROZEN' },
      });

      await prisma.auditLog.create({
        data: {
          action: 'SONG_FROZEN',
          actorId: req.user.id,
          entityType: 'Song',
          entityId: songId,
        },
      });

      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong freezing the song.' });
    }
  }
);

// POST /api/songs/:songId/unfreeze-requests
// Any logged-in role can ask — Admin resolves it separately below.
// body: { reason? }
router.post('/songs/:songId/unfreeze-requests', requireAuth, async (req, res) => {
  try {
    const { songId } = req.params;
    const song = await prisma.song.findUnique({ where: { id: songId } });
    if (!song) return res.status(404).json({ error: `No song found with id ${songId}.` });
    if (song.status !== 'FROZEN') {
      return res.status(409).json({ error: 'This song is not currently frozen.' });
    }

    const existingOpen = await prisma.unfreezeRequest.findFirst({
      where: { songId, status: 'OPEN' },
    });
    if (existingOpen) {
      return res.status(409).json({
        error: 'There is already an open unfreeze request for this song.',
        request: existingOpen,
      });
    }

    const request = await prisma.unfreezeRequest.create({
      data: { songId, requestedById: req.user.id, reason: req.body.reason || null },
    });

    await prisma.auditLog.create({
      data: {
        action: 'UNFREEZE_REQUESTED',
        actorId: req.user.id,
        entityType: 'Song',
        entityId: songId,
      },
    });

    res.status(201).json(request);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the unfreeze request.' });
  }
});

// GET /api/songs/:songId/unfreeze-requests
router.get('/songs/:songId/unfreeze-requests', requireAuth, async (req, res) => {
  try {
    const requests = await prisma.unfreezeRequest.findMany({
      where: { songId: req.params.songId },
      orderBy: { createdAt: 'desc' },
      include: {
        requestedBy: { select: { id: true, name: true } },
        resolvedBy: { select: { id: true, name: true } },
      },
    });
    res.json(requests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching unfreeze requests.' });
  }
});

// POST /api/songs/:songId/unfreeze-requests/:requestId/resolve — Admin only.
// body: { approve: true|false }
// Approving moves the Song to PENDING_REAPPROVAL (reopened, has history —
// deliberately not the same as a fresh DRAFT). Denying leaves it FROZEN.
router.post(
  '/songs/:songId/unfreeze-requests/:requestId/resolve',
  requireAuth,
  requireRole(['ADMIN'], (req) => ({ songId: req.params.songId })),
  async (req, res) => {
    try {
      const { songId, requestId } = req.params;
      const { approve } = req.body;

      if (typeof approve !== 'boolean') {
        return res.status(400).json({ error: 'approve (true or false) is required.' });
      }

      const request = await prisma.unfreezeRequest.findUnique({ where: { id: requestId } });
      if (!request || request.songId !== songId) {
        return res.status(404).json({ error: 'No matching unfreeze request found.' });
      }
      if (request.status !== 'OPEN') {
        return res.status(409).json({ error: 'This request has already been resolved.' });
      }

      const updatedRequest = await prisma.unfreezeRequest.update({
        where: { id: requestId },
        data: {
          status: approve ? 'APPROVED' : 'DENIED',
          resolvedById: req.user.id,
          resolvedAt: new Date(),
        },
      });

      if (approve) {
        await prisma.song.update({
          where: { id: songId },
          data: { status: 'PENDING_REAPPROVAL' },
        });
      }

      await prisma.auditLog.create({
        data: {
          action: approve ? 'UNFREEZE_APPROVED' : 'UNFREEZE_DENIED',
          actorId: req.user.id,
          entityType: 'Song',
          entityId: songId,
        },
      });

      res.json(updatedRequest);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong resolving the unfreeze request.' });
    }
  }
);

module.exports = router;
