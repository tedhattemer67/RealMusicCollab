const express = require('express');
const prisma = require('../prisma');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

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

module.exports = router;
