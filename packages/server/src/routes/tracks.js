const express = require('express');
const prisma = require('../prisma');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { recordEvent } = require('../lib/events');

const router = express.Router();

const UPLOADER_ROLES = ['ADMIN', 'CONTRIBUTOR'];

async function resolveSongIdForTrack(req) {
  const track = await prisma.track.findUnique({
    where: { id: req.params.trackId },
    select: { songId: true },
  });
  return { songId: track ? track.songId : undefined };
}

// PATCH /api/tracks/:trackId
// body: { name }
router.patch('/tracks/:trackId', requireAuth, requireRole(UPLOADER_ROLES, resolveSongIdForTrack), async (req, res) => {
  try {
    const { trackId } = req.params;
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required.' });
    }

    const track = await prisma.track.findUnique({ where: { id: trackId } });
    if (!track) {
      return res.status(404).json({ error: `No track found with id ${trackId}.` });
    }

    const updated = await prisma.track.update({ where: { id: trackId }, data: { name } });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong renaming the track.' });
  }
});

// PUT /api/tracks/:trackId/current-take
// body: { takeId }
// Promotes an existing take to be the track's current default — the take
// that gets presented for the song and that mixes fall back to. Admin only:
// a Contributor's own *upload* lands as a new take pending promotion (see
// routes/takes.js), but re-pointing the default at a different take is the
// one action that can silently override an existing approved default, so
// it's gated to Admin regardless of who uploaded the take.
router.put(
  '/tracks/:trackId/current-take',
  requireAuth,
  requireRole(['ADMIN'], resolveSongIdForTrack),
  async (req, res) => {
    try {
      const { trackId } = req.params;
      const { takeId } = req.body;
      if (!takeId) {
        return res.status(400).json({ error: 'takeId is required.' });
      }

      const track = await prisma.track.findUnique({
        where: { id: trackId },
        include: {
          song: { select: { id: true, status: true, title: true, projectId: true } },
          currentTake: { select: { id: true, takeNumber: true } },
        },
      });
      if (!track) {
        return res.status(404).json({ error: `No track found with id ${trackId}.` });
      }

      const take = await prisma.take.findUnique({
        where: { id: takeId },
        select: { id: true, trackId: true, takeNumber: true },
      });
      if (!take || take.trackId !== trackId) {
        return res.status(404).json({ error: `No take ${takeId} found on this track.` });
      }

      if (track.currentTakeId === takeId) {
        return res.json({
          ...track,
          alreadyCurrent: true,
          promotedTakeNumber: take.takeNumber,
          unfreezeRequestCreated: false,
          songWasFrozen: track.song.status === 'FROZEN',
        });
      }

      // Same frozen-song handling as the upload paths: don't block, auto-create
      // an unfreeze request instead (unless one's already open). Changing which
      // take a frozen song presents is exactly the kind of edit freezing is
      // meant to flag.
      let unfreezeRequestCreated = false;
      if (track.song.status === 'FROZEN') {
        const existingOpen = await prisma.unfreezeRequest.findFirst({
          where: { songId: track.song.id, status: 'OPEN' },
        });
        if (!existingOpen) {
          await prisma.unfreezeRequest.create({
            data: {
              songId: track.song.id,
              requestedById: req.user.id,
              reason: 'Automatic — current take changed while song was frozen',
            },
          });
          await recordEvent({
            action: 'UNFREEZE_REQUESTED',
            actorId: req.user.id,
            entityType: 'Song',
            entityId: track.song.id,
            projectId: track.song.projectId,
            message: `${req.user.name} triggered an automatic unfreeze request for "${track.song.title}" by changing the current take while it was frozen.`,
          });
          unfreezeRequestCreated = true;
        }
      }

      const updated = await prisma.track.update({
        where: { id: trackId },
        data: { currentTakeId: takeId },
        include: {
          currentTake: { select: { id: true, takeNumber: true } },
          _count: { select: { takes: true } },
        },
      });

      await recordEvent({
        action: 'TAKE_PROMOTED',
        actorId: req.user.id,
        entityType: 'Take',
        entityId: takeId,
        projectId: track.song.projectId,
        metadata: {
          trackId,
          fromTakeNumber: track.currentTake ? track.currentTake.takeNumber : null,
          toTakeNumber: take.takeNumber,
        },
        message: `${req.user.name} set Take ${take.takeNumber} as the current take for "${track.name}" on "${track.song.title}".`,
      });

      res.json({
        ...updated,
        promotedTakeNumber: take.takeNumber,
        unfreezeRequestCreated,
        songWasFrozen: track.song.status === 'FROZEN',
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong changing the current take.' });
    }
  }
);

module.exports = router;
