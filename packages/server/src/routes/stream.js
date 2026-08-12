const express = require('express');
const fs = require('fs');
const path = require('path');
const prisma = require('../prisma');
const requireAuth = require('../middleware/requireAuth');
const { LOCAL_ROOT } = require('../storage');

const router = express.Router();

// Range support is essential, not optional — browsers rely on it for
// seeking within audio, and some won't play back at all without it.
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

// GET /api/takes/:takeId/stream
router.get('/takes/:takeId/stream', requireAuth, async (req, res) => {
  try {
    const take = await prisma.take.findUnique({
      where: { id: req.params.takeId },
      include: { storageConfig: true },
    });
    if (!take) {
      return res.status(404).json({ error: `No take found with id ${req.params.takeId}.` });
    }
    // Only LOCAL is implemented right now — this fails loudly and clearly
    // rather than silently mis-serving once S3/Drive adapters exist later.
    if (take.storageConfig.type !== 'LOCAL') {
      return res.status(501).json({
        error: `Streaming for ${take.storageConfig.type} isn't built yet — only LOCAL storage is supported right now.`,
      });
    }
    const absolutePath = path.join(LOCAL_ROOT, take.storageKey);
    streamLocalFile(req, res, absolutePath);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Something went wrong streaming the take.' });
    }
  }
});

// GET /api/mixes/:mixId/stream
router.get('/mixes/:mixId/stream', requireAuth, async (req, res) => {
  try {
    const mix = await prisma.mix.findUnique({
      where: { id: req.params.mixId },
      include: { storageConfig: true },
    });
    if (!mix) {
      return res.status(404).json({ error: `No mix found with id ${req.params.mixId}.` });
    }
    if (mix.storageConfig.type !== 'LOCAL') {
      return res.status(501).json({
        error: `Streaming for ${mix.storageConfig.type} isn't built yet — only LOCAL storage is supported right now.`,
      });
    }
    const absolutePath = path.join(LOCAL_ROOT, mix.storageKey);
    streamLocalFile(req, res, absolutePath);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Something went wrong streaming the mix.' });
    }
  }
});

module.exports = router;
