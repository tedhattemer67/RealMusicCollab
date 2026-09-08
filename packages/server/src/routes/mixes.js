const express = require('express');
const multer = require('multer');
const prisma = require('../prisma');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { MEMBER_ROLES } = require('../lib/roles');
const { getDefaultStorageConfig, writeFile } = require('../storage');
const { recordEvent } = require('../lib/events');

const router = express.Router();

// Memory storage so the file can go through writeFile() and land on
// whichever adapter is actually configured, instead of always disk.
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/songs/:songId/mixes
// multipart/form-data:
//   file       (required)
//   components (optional JSON string: [{ "trackId": "...", "takeId": "..." }])
//     — overrides specific tracks; any track not mentioned falls back to its
//     current default take if it has one, and is simply skipped if it doesn't
//     (a mix doesn't need to cover every track, per how we designed this).
router.post(
  '/songs/:songId/mixes',
  requireAuth,
  requireRole(['ADMIN', 'CONTRIBUTOR'], (req) => ({ songId: req.params.songId })),
  upload.single('file'),
  async (req, res) => {
    try {
      const { songId } = req.params;

      if (!req.file) {
        return res.status(400).json({ error: 'A file is required (field name: "file").' });
      }

      const song = await prisma.song.findUnique({
        where: { id: songId },
        include: { tracks: { select: { id: true, currentTakeId: true } } },
      });
      if (!song) {
        return res.status(404).json({ error: `No song found with id ${songId}.` });
      }

      let overrides = [];
      if (req.body.components) {
        try {
          overrides = JSON.parse(req.body.components);
        } catch (e) {
          return res.status(400).json({ error: 'components must be valid JSON.' });
        }
      }
      const overrideMap = new Map(overrides.map((c) => [c.trackId, c.takeId]));

      const componentsData = [];
      for (const track of song.tracks) {
        const takeId = overrideMap.has(track.id) ? overrideMap.get(track.id) : track.currentTakeId;
        if (takeId) {
          componentsData.push({ trackId: track.id, takeId });
        }
      }

      const storageConfig = await getDefaultStorageConfig();
      const existingMixCount = await prisma.mix.count({ where: { songId } });
      const mixNumber = existingMixCount + 1;
      const storageKey = await writeFile(
        storageConfig,
        `mixes/${songId}`,
        req.file.originalname,
        req.file.buffer
      );

      const mix = await prisma.mix.create({
        data: {
          songId,
          mixNumber,
          storageConfigId: storageConfig.id,
          storageKey,
          uploadedById: req.user.id,
          components: { create: componentsData },
        },
        include: { components: true },
      });

      // A new mix becomes the song's current one immediately — reviewable
      // right away without needing to be finalized first. Finalizing later
      // just stamps it FINAL; it doesn't touch "current" again.
      await prisma.song.update({
        where: { id: songId },
        data: { currentMixId: mix.id },
      });

      await recordEvent({
        action: 'MIX_CREATED',
        actorId: req.user.id,
        entityType: 'Mix',
        entityId: mix.id,
        projectId: song.projectId,
        message: `${req.user.name} created Mix v${mix.mixNumber} for "${song.title}".`,
      });

      res.status(201).json(mix);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong creating the mix.' });
    }
  }
);

// GET /api/songs/:songId/mixes — every version, not just the current one
router.get('/songs/:songId/mixes', requireAuth, requireRole(MEMBER_ROLES, (req) => ({ songId: req.params.songId }), { notFoundOnNoAccess: true }), async (req, res) => {
  try {
    const mixes = await prisma.mix.findMany({
      where: { songId: req.params.songId },
      orderBy: { mixNumber: 'asc' },
      include: { components: true, uploadedBy: { select: { id: true, name: true } } },
    });
    res.json(mixes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching mixes.' });
  }
});

async function resolveSongIdForMix(req) {
  const mix = await prisma.mix.findUnique({
    where: { id: req.params.mixId },
    select: { songId: true },
  });
  return { songId: mix ? mix.songId : undefined };
}

// POST /api/mixes/:mixId/finalize — Admin only. Permanent: no un-finalize,
// same as the Song freeze pattern. Redoing a mix means a new Mix row.
router.post(
  '/mixes/:mixId/finalize',
  requireAuth,
  requireRole(['ADMIN'], resolveSongIdForMix),
  async (req, res) => {
    try {
      const { mixId } = req.params;
      const mix = await prisma.mix.findUnique({
        where: { id: mixId },
        include: { song: { select: { title: true, projectId: true } } },
      });
      if (!mix) return res.status(404).json({ error: `No mix found with id ${mixId}.` });
      if (mix.status === 'FINAL') {
        return res.status(409).json({ error: 'This mix is already final.' });
      }

      const updated = await prisma.mix.update({
        where: { id: mixId },
        data: { status: 'FINAL' },
      });

      await recordEvent({
        action: 'MIX_FINALIZED',
        actorId: req.user.id,
        entityType: 'Mix',
        entityId: mixId,
        projectId: mix.song.projectId,
        message: `${req.user.name} finalized Mix v${mix.mixNumber} for "${mix.song.title}".`,
      });

      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong finalizing the mix.' });
    }
  }
);

module.exports = router;
