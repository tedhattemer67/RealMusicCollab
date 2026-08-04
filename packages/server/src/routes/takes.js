const express = require('express');
const multer = require('multer');
const path = require('path');
const prisma = require('../prisma');
const { getOrCreateDefaultLocalConfig, ensureDir, LOCAL_ROOT } = require('../storage');

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
// multipart/form-data fields:
//   file             (required) — the audio file itself
//   performedById    (required) — stand-in for real auth, for now
//   uploadedById     (required) — stand-in for real auth, for now
//   note             (optional)
//   recordedOn       (optional, ISO date string)
//   readyForFeedback (optional, "false" to mark as a private draft — defaults to true)
router.post('/tracks/:trackId/takes', upload.single('file'), async (req, res) => {
  try {
    const { trackId } = req.params;
    const { performedById, uploadedById, note, recordedOn, readyForFeedback } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'A file is required (field name: "file").' });
    }
    if (!performedById || !uploadedById) {
      return res
        .status(400)
        .json({ error: 'performedById and uploadedById are both required.' });
    }

    const track = await prisma.track.findUnique({ where: { id: trackId } });
    if (!track) {
      return res.status(404).json({ error: `No track found with id ${trackId}.` });
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
    // a new take, pending an Admin's promotion later.
    const uploader = await prisma.user.findUnique({ where: { id: uploadedById } });
    let promoted = false;
    if (uploader && uploader.instanceRole === 'ADMIN') {
      await prisma.track.update({
        where: { id: trackId },
        data: { currentTakeId: take.id },
      });
      promoted = true;
    }

    res.status(201).json({ ...take, promotedToDefault: promoted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the take.' });
  }
});

module.exports = router;
