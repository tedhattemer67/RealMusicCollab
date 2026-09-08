const express = require('express');
const fs = require('fs');
const path = require('path');
const prisma = require('../prisma');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { MEMBER_ROLES } = require('../lib/roles');
const { fromTakeParam, fromMixParam } = require('../lib/scope');
const { LOCAL_ROOT, getRedirectUrl } = require('../storage');

const router = express.Router();

// Range support is essential, not optional — browsers rely on it for
// seeking within audio, and some won't play back at all without it. Only
// needed for LOCAL: an S3 presigned URL already supports Range requests
// natively, since the browser talks directly to S3 for those.
function streamLocalFile(req, res, absolutePath) {
  if (!fs.existsSync(absolutePath)) {
    return res.status(404).json({ error: 'File not found on disk.' });
  }
  const stat = fs.statSync(absolutePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Accept-Ranges', 'bytes');

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
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
async function streamOrRedirect(req, res, storageConfig, storageKey) {
  const redirectUrl = await getRedirectUrl(storageConfig, storageKey);
  if (redirectUrl) {
    return res.redirect(302, redirectUrl);
  }

  if (storageConfig.type === 'LOCAL') {
    const absolutePath = path.join(LOCAL_ROOT, storageKey);
    return streamLocalFile(req, res, absolutePath);
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
    if (!take) {
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
