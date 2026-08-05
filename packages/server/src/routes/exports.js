const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const prisma = require('../prisma');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { LOCAL_ROOT } = require('../storage');

const router = express.Router();

// POST /api/songs/:songId/export
// body: {
//   mode: 'working' | 'handoff'   (required)
//   tracks: [{ trackId, takeId? }]  (optional — omit takeId to use that
//     track's current default; omit the whole array to include every
//     track's current default)
//   includeMix: true|false  (optional, defaults to true if a current mix exists)
// }
// All roles, including Viewer, can hit this — matches how we designed export.
router.post('/songs/:songId/export', requireAuth, async (req, res) => {
  try {
    const { songId } = req.params;
    const { mode, tracks, includeMix } = req.body;

    if (mode !== 'working' && mode !== 'handoff') {
      return res.status(400).json({ error: 'mode must be "working" or "handoff".' });
    }

    const song = await prisma.song.findUnique({
      where: { id: songId },
      include: {
        tracks: { select: { id: true, name: true, currentTakeId: true } },
        currentMix: true,
      },
    });
    if (!song) {
      return res.status(404).json({ error: `No song found with id ${songId}.` });
    }

    // Figure out exactly which track/take pairs to include.
    let selections;
    if (Array.isArray(tracks) && tracks.length > 0) {
      selections = tracks
        .map((t) => ({
          trackId: t.trackId,
          takeId: t.takeId || song.tracks.find((tr) => tr.id === t.trackId)?.currentTakeId,
        }))
        .filter((s) => s.takeId);
    } else {
      selections = song.tracks
        .filter((t) => t.currentTakeId)
        .map((t) => ({ trackId: t.id, takeId: t.currentTakeId }));
    }

    const willIncludeMix = includeMix !== false && !!song.currentMix;
    if (selections.length === 0 && !willIncludeMix) {
      return res.status(400).json({ error: 'Nothing to export — no takes or mix available.' });
    }

    const takeIds = selections.map((s) => s.takeId);
    const takes = await prisma.take.findMany({
      where: { id: { in: takeIds } },
      include: { track: true, performedBy: { select: { name: true } } },
    });
    const takeById = new Map(takes.map((t) => [t.id, t]));

    const zipName = `${song.title.replace(/\s+/g, '_')}_export.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Something went wrong preparing the export.' });
      } else {
        res.destroy(err);
      }
    });
    archive.pipe(res);

    const manifestLines = [];

    for (const sel of selections) {
      const take = takeById.get(sel.takeId);
      if (!take) continue;
      const filePath = path.join(LOCAL_ROOT, take.storageKey);
      if (!fs.existsSync(filePath)) continue;

      const trackName = take.track.name;
      const filename =
        mode === 'handoff'
          ? `${trackName}.wav`
          : `${trackName.replace(/\s+/g, '')}_Take${take.takeNumber}.wav`;

      archive.file(filePath, { name: filename });

      if (mode === 'handoff') {
        const recordedStr = take.recordedOn
          ? take.recordedOn.toISOString().slice(0, 10)
          : 'unknown date';
        manifestLines.push(
          `${trackName}: Take ${take.takeNumber}, performed by ${
            take.performedBy?.name || 'unknown'
          }, recorded ${recordedStr}${take.note ? ' — ' + take.note : ''}`
        );
      }
    }

    if (willIncludeMix) {
      const mixFilePath = path.join(LOCAL_ROOT, song.currentMix.storageKey);
      if (fs.existsSync(mixFilePath)) {
        const mixFilename =
          mode === 'handoff' ? `${song.title} (Mix).wav` : `Mix_v${song.currentMix.mixNumber}.wav`;
        archive.file(mixFilePath, { name: mixFilename });
        if (mode === 'handoff') {
          manifestLines.push(`Mix: v${song.currentMix.mixNumber} (${song.currentMix.status})`);
        }
      }
    }

    if (mode === 'handoff' && manifestLines.length > 0) {
      archive.append(manifestLines.join('\n'), { name: 'info-sheet.txt' });
    }

    await prisma.auditLog.create({
      data: {
        action: mode === 'handoff' ? 'DOWNLOAD_HANDOFF' : 'DOWNLOAD_WORKING_PULL',
        actorId: req.user.id,
        entityType: 'Song',
        entityId: songId,
        metadata: { tracksIncluded: selections.length, mixIncluded: willIncludeMix },
      },
    });

    archive.finalize();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Something went wrong preparing the export.' });
    }
  }
});

// POST /api/projects/:projectId/archive — Admin only (judgment call: this
// pulls every take's full history for an entire project, a bigger exposure
// than a routine per-song export, which is why it's gated more tightly).
// Always includes the full manifest, no mode toggle — a bigger, more
// deliberate action than a routine working pull or handoff.
router.post(
  '/projects/:projectId/archive',
  requireAuth,
  requireRole(['ADMIN'], (req) => ({ projectId: req.params.projectId })),
  async (req, res) => {
    try {
      const { projectId } = req.params;
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          songs: {
            include: {
              tracks: {
                include: {
                  takes: { include: { performedBy: { select: { name: true } } } },
                },
              },
              mixes: true,
            },
          },
        },
      });
      if (!project) {
        return res.status(404).json({ error: `No project found with id ${projectId}.` });
      }

      const zipName = `${project.name.replace(/\s+/g, '_')}_full_archive.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', (err) => {
        console.error('Archive error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Something went wrong preparing the archive.' });
        } else {
          res.destroy(err);
        }
      });
      archive.pipe(res);

      const manifestLines = [`Full archive: ${project.name}`, ''];

      for (const song of project.songs) {
        manifestLines.push(`## ${song.title}`);
        for (const track of song.tracks) {
          manifestLines.push(`  ${track.name}:`);
          for (const take of track.takes) {
            const filePath = path.join(LOCAL_ROOT, take.storageKey);
            if (fs.existsSync(filePath)) {
              const filename = `${song.title}/${track.name}/Take${take.takeNumber}.wav`;
              archive.file(filePath, { name: filename });
            }
            const isDefault = take.id === track.currentTakeId ? ' (was current default)' : '';
            manifestLines.push(
              `    Take ${take.takeNumber} — performed by ${take.performedBy?.name || 'unknown'}${isDefault}`
            );
          }
        }
        for (const mix of song.mixes) {
          const mixFilePath = path.join(LOCAL_ROOT, mix.storageKey);
          if (fs.existsSync(mixFilePath)) {
            const filename = `${song.title}/Mix_v${mix.mixNumber}.wav`;
            archive.file(mixFilePath, { name: filename });
          }
          manifestLines.push(`  Mix v${mix.mixNumber} — ${mix.status}`);
        }
        manifestLines.push('');
      }

      archive.append(manifestLines.join('\n'), { name: 'manifest.txt' });

      await prisma.auditLog.create({
        data: {
          action: 'DOWNLOAD_ARCHIVE',
          actorId: req.user.id,
          entityType: 'Project',
          entityId: projectId,
        },
      });

      archive.finalize();
    } catch (err) {
      console.error(err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Something went wrong preparing the archive.' });
      }
    }
  }
);

module.exports = router;
