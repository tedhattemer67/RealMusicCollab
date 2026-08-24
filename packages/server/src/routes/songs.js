const express = require('express');
const multer = require('multer');
const prisma = require('../prisma');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { getDefaultStorageConfig, writeFile } = require('../storage');
const { parseBatchFilenames } = require('../lib/filenameParser');
const { recordEvent } = require('../lib/events');

const router = express.Router();

// Memory storage, not disk storage like the regular take-upload route —
// the Track doesn't exist yet when the file arrives, so there's no id to
// build a destination folder from until after we create the row.
const uploadMemory = multer({ storage: multer.memoryStorage() });

// Not Viewer (listen/comment only) and not Reviewer (approves, doesn't
// upload) — only Admin and Contributor can add material.
const UPLOADER_ROLES = ['ADMIN', 'CONTRIBUTOR'];

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

      await recordEvent({
        action: 'SONG_FROZEN',
        actorId: req.user.id,
        entityType: 'Song',
        entityId: songId,
        projectId: song.projectId,
        message: `${req.user.name} froze "${song.title}".`,
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

    await recordEvent({
      action: 'UNFREEZE_REQUESTED',
      actorId: req.user.id,
      entityType: 'Song',
      entityId: songId,
      projectId: song.projectId,
      message: `${req.user.name} requested an unfreeze for "${song.title}".`,
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

      const song = await prisma.song.findUnique({ where: { id: songId } });

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

      await recordEvent({
        action: approve ? 'UNFREEZE_APPROVED' : 'UNFREEZE_DENIED',
        actorId: req.user.id,
        entityType: 'Song',
        entityId: songId,
        projectId: song.projectId,
        message: `${req.user.name} ${approve ? 'approved' : 'denied'} the unfreeze request for "${song.title}".`,
      });

      res.json(updatedRequest);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong resolving the unfreeze request.' });
    }
  }
);

module.exports = router;

// POST /api/songs/:songId/tracks
// Creates a new Track *and* its first Take together — never leaves an
// observably empty track, same non-null-in-the-UI principle from the
// original schema design.
// multipart/form-data:
//   name             (required) — the track's name
//   file             (required) — its first take's audio
//   performedById    (optional) — defaults to the logged-in user
//   note             (optional)
//   recordedOn       (optional, ISO date string)
//   readyForFeedback (optional, "false" to mark as a private draft)
router.post('/songs/:songId/tracks', requireAuth, requireRole(UPLOADER_ROLES, (req) => ({ songId: req.params.songId })), uploadMemory.single('file'), async (req, res) => {
  try {
    const { songId } = req.params;
    const { name, note, recordedOn, readyForFeedback } = req.body;
    const performedById = req.body.performedById || req.user.id;

    if (!name) {
      return res.status(400).json({ error: 'name (the track name) is required.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'A file is required (field name: "file").' });
    }

    const song = await prisma.song.findUnique({ where: { id: songId } });
    if (!song) {
      return res.status(404).json({ error: `No song found with id ${songId}.` });
    }

    // Same frozen-song handling as the regular upload endpoint: don't block,
    // auto-create an unfreeze request instead (unless one's already open).
    let unfreezeRequestCreated = false;
    if (song.status === 'FROZEN') {
      const existingOpen = await prisma.unfreezeRequest.findFirst({
        where: { songId, status: 'OPEN' },
      });
      if (!existingOpen) {
        await prisma.unfreezeRequest.create({
          data: {
            songId,
            requestedById: req.user.id,
            reason: 'Automatic — new track added while song was frozen',
          },
        });
        await recordEvent({
          action: 'UNFREEZE_REQUESTED',
          actorId: req.user.id,
          entityType: 'Song',
          entityId: songId,
          projectId: song.projectId,
          message: `${req.user.name} triggered an automatic unfreeze request for "${song.title}" by adding a new track while it was frozen.`,
        });
        unfreezeRequestCreated = true;
      }
    }

    const track = await prisma.track.create({ data: { songId, name } });

    const storageConfig = await getDefaultStorageConfig();
    const storageKey = await writeFile(storageConfig, track.id, req.file.originalname, req.file.buffer);

    const take = await prisma.take.create({
      data: {
        trackId: track.id,
        takeNumber: 1,
        storageConfigId: storageConfig.id,
        storageKey,
        performedById,
        uploadedById: req.user.id,
        note: note || null,
        recordedOn: recordedOn ? new Date(recordedOn) : null,
        readyForFeedback: readyForFeedback === 'false' ? false : true,
      },
    });

    // A brand-new track's first take always becomes current, regardless of
    // role. The role-gated promotion rule exists to protect an *existing*
    // default from being silently overridden — that risk doesn't apply to a
    // track that has nothing yet.
    await prisma.track.update({
      where: { id: track.id },
      data: { currentTakeId: take.id },
    });

    await recordEvent({
      action: 'TAKE_UPLOADED',
      actorId: req.user.id,
      entityType: 'Take',
      entityId: take.id,
      projectId: song.projectId,
      message: `${req.user.name} uploaded Take ${take.takeNumber} for "${name}" on "${song.title}".`,
    });

    res.status(201).json({
      ...track,
      currentTake: take,
      songWasFrozen: song.status === 'FROZEN',
      unfreezeRequestCreated,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the track.' });
  }
});

// POST /api/songs/:songId/batch-preview
// body: { filenames: string[] }
// Takes just filenames — no file bytes — and returns a proposed breakdown:
// for each file, the parsed candidate name and whether it matches an
// existing track in this song (-> would add a take there) or looks new
// (-> would create a track). Nothing is saved here. This exists specifically
// so a bad or ambiguous parse costs nothing — it's caught and fixed in this
// preview, never silently committed.
router.post('/songs/:songId/batch-preview', requireAuth, requireRole(UPLOADER_ROLES, (req) => ({ songId: req.params.songId })), async (req, res) => {
  try {
    const { songId } = req.params;
    const { filenames } = req.body;
    if (!Array.isArray(filenames) || filenames.length === 0) {
      return res.status(400).json({ error: 'filenames must be a non-empty array.' });
    }

    const song = await prisma.song.findUnique({
      where: { id: songId },
      include: { tracks: { select: { id: true, name: true } } },
    });
    if (!song) {
      return res.status(404).json({ error: `No song found with id ${songId}.` });
    }

    const parsed = parseBatchFilenames(filenames);

    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const trackByNormalizedName = new Map(song.tracks.map((t) => [normalize(t.name), t]));

    const preview = parsed.map(({ filename, candidateName }) => {
      const match = trackByNormalizedName.get(normalize(candidateName));
      return {
        filename,
        candidateName,
        matchedTrackId: match ? match.id : null,
        matchedTrackName: match ? match.name : null,
        action: match ? 'add-take' : 'new-track',
      };
    });

    res.json({ preview });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong previewing the batch.' });
  }
});

// POST /api/songs/:songId/batch-upload
// multipart/form-data:
//   files  — the actual audio files (field name "files", multiple)
//   items  — a JSON string: an array parallel to the confirmed preview,
//            each { filename, name, action: 'new-track'|'add-take',
//                    trackId? (required for add-take), performedById?, note? }
// This is the real commit step — only reached after the user has reviewed
// and possibly corrected everything in batch-preview above.
router.post(
  '/songs/:songId/batch-upload',
  requireAuth,
  requireRole(UPLOADER_ROLES, (req) => ({ songId: req.params.songId })),
  uploadMemory.array('files'),
  async (req, res) => {
    try {
      const { songId } = req.params;
      let items;
      try {
        items = JSON.parse(req.body.items);
      } catch (e) {
        return res.status(400).json({ error: 'items must be valid JSON.' });
      }
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items must be a non-empty array.' });
      }
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files were uploaded.' });
      }

      const song = await prisma.song.findUnique({ where: { id: songId } });
      if (!song) {
        return res.status(404).json({ error: `No song found with id ${songId}.` });
      }

      const fileByName = new Map(req.files.map((f) => [f.originalname, f]));
      const storageConfig = await getDefaultStorageConfig();

      // One unfreeze request for the whole batch — not one per file.
      let unfreezeRequestCreated = false;
      if (song.status === 'FROZEN') {
        const existingOpen = await prisma.unfreezeRequest.findFirst({
          where: { songId, status: 'OPEN' },
        });
        if (!existingOpen) {
          await prisma.unfreezeRequest.create({
            data: {
              songId,
              requestedById: req.user.id,
              reason: 'Automatic — batch upload while song was frozen',
            },
          });
          await recordEvent({
            action: 'UNFREEZE_REQUESTED',
            actorId: req.user.id,
            entityType: 'Song',
            entityId: songId,
            projectId: song.projectId,
            message: `${req.user.name} triggered an automatic unfreeze request for "${song.title}" via a batch upload while it was frozen.`,
          });
          unfreezeRequestCreated = true;
        }
      }

      // Processed one at a time and reported per-file, rather than one
      // all-or-nothing transaction — a bad file in a batch of 8 shouldn't
      // sink the other 7.
      const results = [];

      for (const item of items) {
        const file = fileByName.get(item.filename);
        if (!file) {
          results.push({ filename: item.filename, error: 'File not found in upload.' });
          continue;
        }

        try {
          let trackId = item.trackId;
          let trackName = item.name;

          if (item.action === 'new-track') {
            if (!item.name) {
              results.push({
                filename: item.filename,
                error: 'A track name is required for a new track — this should always come from what was confirmed on the review screen, never assumed.',
              });
              continue;
            }
            const track = await prisma.track.create({ data: { songId, name: item.name } });
            trackId = track.id;
          } else if (!trackId) {
            results.push({ filename: item.filename, error: 'trackId is required for add-take.' });
            continue;
          } else if (item.name) {
            // Lets a name correction from the review screen ride along
            // even when the file itself is landing on an existing track.
            await prisma.track.update({ where: { id: trackId }, data: { name: item.name } });
          } else {
            const existingTrack = await prisma.track.findUnique({ where: { id: trackId }, select: { name: true } });
            trackName = existingTrack ? existingTrack.name : 'Unknown track';
          }

          const storageKey = await writeFile(storageConfig, trackId, file.originalname, file.buffer);

          const existingTakeCount = await prisma.take.count({ where: { trackId } });
          const takeNumber = existingTakeCount + 1;
          const performedById = item.performedById || req.user.id;

          const take = await prisma.take.create({
            data: {
              trackId,
              takeNumber,
              storageConfigId: storageConfig.id,
              storageKey,
              performedById,
              uploadedById: req.user.id,
              note: item.note || null,
              readyForFeedback: true,
            },
          });

          // Same promotion rule as everywhere else: a brand-new track's
          // first take always becomes current; for an existing track, only
          // an Admin's upload auto-promotes.
          let promoted = false;
          if (item.action === 'new-track' || req.user.instanceRole === 'ADMIN') {
            await prisma.track.update({ where: { id: trackId }, data: { currentTakeId: take.id } });
            promoted = true;
          }

          await recordEvent({
            action: 'TAKE_UPLOADED',
            actorId: req.user.id,
            entityType: 'Take',
            entityId: take.id,
            projectId: song.projectId,
            message: `${req.user.name} uploaded Take ${takeNumber} for "${trackName}" on "${song.title}" (batch upload).`,
          });

          results.push({
            filename: item.filename,
            trackId,
            takeId: take.id,
            takeNumber,
            promotedToDefault: promoted,
          });
        } catch (err) {
          console.error(err);
          results.push({ filename: item.filename, error: 'Something went wrong processing this file.' });
        }
      }

      res.status(201).json({
        results,
        songWasFrozen: song.status === 'FROZEN',
        unfreezeRequestCreated,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong with the batch upload.' });
    }
  }
);
