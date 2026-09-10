const express = require('express');
const fs = require('fs');
const path = require('path');
const prisma = require('../prisma');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { MEMBER_ROLES, canSeeDraftTakes } = require('../lib/roles');
const { fromTakeParam, fromMixParam } = require('../lib/scope');
const { LOCAL_ROOT, getRedirectUrl } = require('../storage');
const { recordEvent } = require('../lib/events');
const { sanitizeExportSegment } = require('../lib/filenameSegment');

const router = express.Router();

// Range support is essential, not optional — browsers rely on it for
// seeking within audio, and some won't play back at all without it. Only
// needed for LOCAL: an S3 presigned URL already supports Range requests
// natively, since the browser talks directly to S3 for those.
function streamLocalFile(req, res, absolutePath, { downloadFilename } = {}) {
  if (!fs.existsSync(absolutePath)) {
    return res.status(404).json({ error: 'File not found on disk.' });
  }
  const stat = fs.statSync(absolutePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Accept-Ranges', 'bytes');
  if (downloadFilename) {
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
  }

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    // A malformed Range header (non-numeric, start past the end of the
    // file, or a backwards range) used to fall straight through to a NaN
    // Content-Length and a broken stream — reject it properly instead,
    // same as any real HTTP server would.
    const isValidRange = Number.isInteger(start) && Number.isInteger(end) && start >= 0 && start <= end && end < fileSize;
    if (!isValidRange) {
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      return res.status(416).end();
    }

    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Content-Length': chunkSize,
    });
    fs.createReadStream(absolutePath, { start, end }).pipe(res);
  } else {
    res.setHeader('Content-Length', fileSize);
    res.writeHead(200);
    fs.createReadStream(absolutePath).pipe(res);
  }
}

// Shared by both routes below: redirect to a signed URL when the adapter
// supports one (S3 — faster, and doesn't route audio bytes through this
// server at all), otherwise proxy directly from disk (LOCAL, which has no
// concept of a URL to redirect to).
async function streamOrRedirect(req, res, storageConfig, storageKey, options = {}) {
  const redirectUrl = await getRedirectUrl(storageConfig, storageKey, options);
  if (redirectUrl) {
    return res.redirect(302, redirectUrl);
  }

  if (storageConfig.type === 'LOCAL') {
    const absolutePath = path.join(LOCAL_ROOT, storageKey);
    return streamLocalFile(req, res, absolutePath, options);
  }

  res.status(501).json({
    error: `Streaming for ${storageConfig.type} isn't implemented yet.`,
  });
}

// GET /api/takes/:takeId/stream
router.get('/takes/:takeId/stream', requireAuth, requireRole(MEMBER_ROLES, fromTakeParam, { notFoundOnNoAccess: true }), async (req, res) => {
  try {
    const take = await prisma.take.findUnique({
      where: { id: req.params.takeId },
      include: { storageConfig: true },
    });
    // Same 404-hides-existence treatment as a non-member: a "private
    // draft" take's audio isn't reachable by anyone outside the roles
    // that can upload material, even with a direct link to it.
    if (!take || (!take.readyForFeedback && !canSeeDraftTakes(req.effectiveRole))) {
      return res.status(404).json({ error: `No take found with id ${req.params.takeId}.` });
    }
    await streamOrRedirect(req, res, take.storageConfig, take.storageKey);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Something went wrong streaming the take.' });
    }
  }
});

// GET /api/takes/:takeId/download — same access rule as /stream, but forces
// a real file download (Content-Disposition: attachment) with a human
// filename instead of playing back inline, for pulling one track's current
// take straight into a DAW without exporting the whole song.
router.get('/takes/:takeId/download', requireAuth, requireRole(MEMBER_ROLES, fromTakeParam, { notFoundOnNoAccess: true }), async (req, res) => {
  try {
    const take = await prisma.take.findUnique({
      where: { id: req.params.takeId },
      include: { storageConfig: true, track: { include: { song: true } } },
    });
    if (!take || (!take.readyForFeedback && !canSeeDraftTakes(req.effectiveRole))) {
      return res.status(404).json({ error: `No take found with id ${req.params.takeId}.` });
    }

    const trackName = sanitizeExportSegment(take.track.name).replace(/\s+/g, '');
    const filename = `${trackName}_Take${take.takeNumber}.wav`;
    await streamOrRedirect(req, res, take.storageConfig, take.storageKey, { downloadFilename: filename });

    await recordEvent({
      action: 'DOWNLOAD_TRACK',
      actorId: req.user.id,
      entityType: 'Take',
      entityId: take.id,
      projectId: take.track.song.projectId,
      message: `${req.user.name} downloaded "${take.track.name}" (Take ${take.takeNumber}) from "${take.track.song.title}".`,
    });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Something went wrong downloading the take.' });
    }
  }
});

// GET /api/mixes/:mixId/stream
router.get('/mixes/:mixId/stream', requireAuth, requireRole(MEMBER_ROLES, fromMixParam, { notFoundOnNoAccess: true }), async (req, res) => {
  try {
    const mix = await prisma.mix.findUnique({
      where: { id: req.params.mixId },
      include: { storageConfig: true },
    });
    if (!mix) {
      return res.status(404).json({ error: `No mix found with id ${req.params.mixId}.` });
    }
    await streamOrRedirect(req, res, mix.storageConfig, mix.storageKey);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Something went wrong streaming the mix.' });
    }
  }
});

module.exports = router;
