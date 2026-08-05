const express = require('express');
const multer = require('multer');
const path = require('path');
const prisma = require('../prisma');
const { getOrCreateDefaultLocalConfig, ensureDir, LOCAL_ROOT } = require('../storage');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// Files get written straight to their track's own folder as they're uploaded,
// named with a timestamp prefix so two uploads never collide.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(LOCAL_ROOT, req.params.trackId);
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

// POST /api/tracks/:trackId/takes
// Requires a logged-in session — uploadedById comes from req.user, not the
// request body, now that requireAuth actually verifies who's asking.
// multipart/form-data fields:
//   file             (required) — the audio file itself
//   performedById    (optional) — defaults to the logged-in user; override
//                                  when uploading on behalf of a session guest
//   note             (optional)
//   recordedOn       (optional, ISO date string)
//   readyForFeedback (optional, "false" to mark as a private draft — defaults to true)
router.post('/tracks/:trackId/takes', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const { trackId } = req.params;
    const { note, recordedOn, readyForFeedback } = req.body;
    const performedById = req.body.performedById || req.user.id;
    const uploadedById = req.user.id;

    if (!req.file) {
      return res.status(400).json({ error: 'A file is required (field name: "file").' });
    }

    const track = await prisma.track.findUnique({
      where: { id: trackId },
      include: { song: { select: { id: true, status: true } } },
    });
    if (!track) {
      return res.status(404).json({ error: `No track found with id ${trackId}.` });
    }

    // Uploading to a frozen song doesn't get blocked — it auto-creates an
    // unfreeze request instead (unless one's already open), per how we
    // designed this. The take still gets created either way.
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
            reason: 'Automatic — new upload while song was frozen',
          },
        });
        await prisma.auditLog.create({
          data: {
            action: 'UNFREEZE_REQUESTED',
            actorId: req.user.id,
            entityType: 'Song',
            entityId: track.song.id,
          },
        });
        unfreezeRequestCreated = true;
      }
    }

    const storageConfig = await getOrCreateDefaultLocalConfig();

    // takeNumber is sequential per track — computed here, not left to the
    // database, per how we designed it.
    const existingTakeCount = await prisma.take.count({ where: { trackId } });
    const takeNumber = existingTakeCount + 1;

    // Store the path relative to LOCAL_ROOT, not the absolute machine path —
    // keeps storageKey portable if the app ever runs somewhere else.
    const storageKey = path.relative(LOCAL_ROOT, req.file.path).replace(/\\/g, '/');

    const take = await prisma.take.create({
      data: {
        trackId,
        takeNumber,
        storageConfigId: storageConfig.id,
        storageKey,
        performedById,
        uploadedById,
        note: note || null,
        recordedOn: recordedOn ? new Date(recordedOn) : null,
        readyForFeedback: readyForFeedback === 'false' ? false : true,
      },
    });

    // The role-dependent promotion rule we designed: an Admin's own upload
    // auto-promotes to the track's current default; anyone else's lands as
    // a new take, pending an Admin's promotion later. req.user came straight
    // from the verified session, so this is a real check now, not a guess.
    let promoted = false;
    if (req.user.instanceRole === 'ADMIN') {
      await prisma.track.update({
        where: { id: trackId },
        data: { currentTakeId: take.id },
      });
      promoted = true;
    }

    await prisma.auditLog.create({
      data: {
        action: 'TAKE_UPLOADED',
        actorId: req.user.id,
        entityType: 'Take',
        entityId: take.id,
      },
    });

    res.status(201).json({
      ...take,
      promotedToDefault: promoted,
      songWasFrozen: track.song.status === 'FROZEN',
      unfreezeRequestCreated,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the take.' });
  }
});

module.exports = router;
