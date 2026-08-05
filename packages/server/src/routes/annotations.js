const express = require('express');
const prisma = require('../prisma');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// Shared create/list logic across all four parent types — kept as plain
// helper functions rather than a route-generating factory, so each actual
// route registration below stays explicit and easy to read.
async function createAnnotation(req, res, parentField, parentId, parentModel) {
  try {
    const parent = await parentModel.findUnique({ where: { id: parentId } });
    if (!parent) {
      return res
        .status(404)
        .json({ error: `No ${parentField.replace('Id', '')} found with id ${parentId}.` });
    }

    const { body, timestampSeconds } = req.body;
    if (!body) {
      return res.status(400).json({ error: 'body is required.' });
    }

    const annotation = await prisma.annotation.create({
      data: {
        authorId: req.user.id,
        body,
        [parentField]: parentId,
        // Only meaningful on a Take — a point in that specific audio file.
        timestampSeconds:
          parentField === 'takeId' && timestampSeconds != null ? Number(timestampSeconds) : null,
      },
    });

    res.status(201).json(annotation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the annotation.' });
  }
}

async function listAnnotations(req, res, parentField, parentId) {
  try {
    const annotations = await prisma.annotation.findMany({
      where: { [parentField]: parentId },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { id: true, name: true } } },
    });
    res.json(annotations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching annotations.' });
  }
}

// Songs — general comments only (timestampSeconds doesn't apply here)
router.post('/songs/:songId/annotations', requireAuth, (req, res) =>
  createAnnotation(req, res, 'songId', req.params.songId, prisma.song)
);
router.get('/songs/:songId/annotations', requireAuth, (req, res) =>
  listAnnotations(req, res, 'songId', req.params.songId)
);

// Tracks
router.post('/tracks/:trackId/annotations', requireAuth, (req, res) =>
  createAnnotation(req, res, 'trackId', req.params.trackId, prisma.track)
);
router.get('/tracks/:trackId/annotations', requireAuth, (req, res) =>
  listAnnotations(req, res, 'trackId', req.params.trackId)
);

// Takes — the only parent type where timestampSeconds actually applies
router.post('/takes/:takeId/annotations', requireAuth, (req, res) =>
  createAnnotation(req, res, 'takeId', req.params.takeId, prisma.take)
);
router.get('/takes/:takeId/annotations', requireAuth, (req, res) =>
  listAnnotations(req, res, 'takeId', req.params.takeId)
);

// Mixes
router.post('/mixes/:mixId/annotations', requireAuth, (req, res) =>
  createAnnotation(req, res, 'mixId', req.params.mixId, prisma.mix)
);
router.get('/mixes/:mixId/annotations', requireAuth, (req, res) =>
  listAnnotations(req, res, 'mixId', req.params.mixId)
);

module.exports = router;
