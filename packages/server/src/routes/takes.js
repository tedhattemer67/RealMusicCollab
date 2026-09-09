const express = require('express');
const prisma = require('../prisma');
const { getDefaultStorageConfig, writeFile } = require('../storage');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { MEMBER_ROLES, UPLOADER_ROLES, canSeeDraftTakes } = require('../lib/roles');
const { recordEvent } = require('../lib/events');
const { upload } = require('../lib/upload');

const router = express.Router();

async function resolveSongIdForTrack(req) {
  const track = await prisma.track.findUnique({
    where: { id: req.params.trackId },
    select: { songId: true },
  });
  return { songId: track ? track.songId : undefined };
}

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
router.post('/tracks/:trackId/takes', requireAuth, requireRole(UPLOADER_ROLES, resolveSongIdForTrack), upload.single('file'), async (req, res) => {
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
      include: { song: { select: { id: true, status: true, title: true, projectId: true } } },
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
        await recordEvent({
          action: 'UNFREEZE_REQUESTED',
          actorId: req.user.id,
          entityType: 'Song',
          entityId: track.song.id,
          projectId: track.song.projectId,
          message: `${req.user.name} triggered an automatic unfreeze request for "${track.song.title}" by uploading a take while it was frozen.`,
        });
        unfreezeRequestCreated = true;
      }
    }

    const storageConfig = await getDefaultStorageConfig();
    const storageKey = await writeFile(storageConfig, trackId, req.file.originalname, req.file.buffer);

    // takeNumber is sequential per track — computed here, not left to the
    // database. Two uploads to the same track landing close together can
    // both read the same count and then collide on
    // @@unique([trackId, takeNumber]); retried a few times (re-reading the
    // count each attempt) instead of surfacing that collision as a raw
    // 500 — by the retry, the other upload has already committed and the
    // count has moved on.
    let take;
    let takeNumber;
    for (let attempt = 0; ; attempt += 1) {
      const existingTakeCount = await prisma.take.count({ where: { trackId } });
      takeNumber = existingTakeCount + 1;
      try {
        take = await prisma.take.create({
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
        break;
      } catch (err) {
        if (err.code === 'P2002' && attempt < 5) continue;
        throw err;
      }
    }

    // The role-dependent promotion rule we designed: an Admin's own upload
    // auto-promotes to the track's current default; anyone else's lands as
    // a new take, pending an Admin's promotion later. Uses the effective role
    // for THIS song (set by requireRole), so a project Admin counts and a
    // mere instance-wide role does not leak in.
    let promoted = false;
    if (req.effectiveRole === 'ADMIN') {
      await prisma.track.update({
        where: { id: trackId },
        data: { currentTakeId: take.id },
      });
      promoted = true;
    }

    await recordEvent({
      action: 'TAKE_UPLOADED',
      actorId: req.user.id,
      entityType: 'Take',
      entityId: take.id,
      projectId: track.song.projectId,
      message: `${req.user.name} uploaded Take ${takeNumber} for "${track.name}" on "${track.song.title}".`,
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

// GET /api/tracks/:trackId/takes — full take history for a track, for the
// "expand to see previous takes" view. POST above only ever created one;
// nothing previously listed them back.
router.get('/tracks/:trackId/takes', requireAuth, requireRole(MEMBER_ROLES, resolveSongIdForTrack, { notFoundOnNoAccess: true }), async (req, res) => {
  try {
    const takes = await prisma.take.findMany({
      where: {
        trackId: req.params.trackId,
        // "Private draft" takes are only visible to the roles that can
        // actually upload material — Reviewer/Viewer (the audience the
        // readyForFeedback flag is named for) don't see them at all until
        // marked ready, not just via a "draft" badge on an otherwise-visible row.
        ...(canSeeDraftTakes(req.effectiveRole) ? {} : { readyForFeedback: true }),
      },
      orderBy: { takeNumber: 'asc' },
      include: {
        performedBy: { select: { id: true, name: true } },
        // Approvals are per-take, so the switcher can show sign-off state for
        // every take at once — not just the current default — without an
        // extra request per row.
        approvals: { include: { user: { select: { id: true, name: true } } } },
      },
    });
    res.json(takes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching takes.' });
  }
});

module.exports = router;
