const express = require('express');
const archiver = require('archiver');
const prisma = require('../prisma');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { MEMBER_ROLES } = require('../lib/roles');
const { getReadStream } = require('../storage');
const { recordEvent } = require('../lib/events');
const { exportLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// song.title / track.name / project.name are free-text and flow straight
// into a Content-Disposition header value and into ZIP entry names below —
// sanitize each one as an individual path SEGMENT (strip slashes/backslashes
// so a crafted name can't inject an extra path level; strip control
// characters and the quote character that would break filename="...";
// collapse a segment that's now just dots so it can't act as a zip-slip
// "../" traversal once joined with the "/"s this code controls itself).
function sanitizeExportSegment(segment) {
  const cleaned = String(segment)
    .replace(/[/\\]/g, '_')
    .replace(/[\x00-\x1f\x7f"]/g, '')
    .trim();
  return /^\.*$/.test(cleaned) || cleaned === '' ? 'untitled' : cleaned;
}

// POST /api/songs/:songId/export
// body: {
//   mode: 'working' | 'handoff'   (required)
//   tracks: [{ trackId, takeId? }]  (optional — omit takeId to use that
//     track's current default; omit the whole array to include every
//     track's current default)
//   includeMix: true|false  (optional, defaults to true if a current mix exists)
// }
// All roles, including Viewer, can hit this — matches how we designed export —
// but only members of the song's project.
router.post('/songs/:songId/export', requireAuth, exportLimiter, requireRole(MEMBER_ROLES, (req) => ({ songId: req.params.songId }), { notFoundOnNoAccess: true }), async (req, res) => {
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
        currentMix: { include: { storageConfig: true } },
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
      include: { track: true, performedBy: { select: { name: true } }, storageConfig: true },
    });
    const takeById = new Map(takes.map((t) => [t.id, t]));

    const zipName = `${sanitizeExportSegment(song.title).replace(/\s+/g, '_')}_export.zip`;
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

    // archive.append() takes a real readable stream — works identically
    // whether getReadStream() is reading from local disk or fetching from
    // S3, unlike archive.file() (which only ever worked for local paths).
    for (const sel of selections) {
      const take = takeById.get(sel.takeId);
      if (!take) continue;
      const result = await getReadStream(take.storageConfig, take.storageKey);
      if (!result) continue;

      const trackName = sanitizeExportSegment(take.track.name);
      const filename =
        mode === 'handoff'
          ? `${trackName}.wav`
          : `${trackName.replace(/\s+/g, '')}_Take${take.takeNumber}.wav`;

      archive.append(result.stream, { name: filename });

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
      const mixResult = await getReadStream(song.currentMix.storageConfig, song.currentMix.storageKey);
      if (mixResult) {
        const mixFilename =
          mode === 'handoff'
            ? `${sanitizeExportSegment(song.title)} (Mix).wav`
            : `Mix_v${song.currentMix.mixNumber}.wav`;
        archive.append(mixResult.stream, { name: mixFilename });
        if (mode === 'handoff') {
          manifestLines.push(`Mix: v${song.currentMix.mixNumber} (${song.currentMix.status})`);
        }
      }
    }

    if (mode === 'handoff' && manifestLines.length > 0) {
      archive.append(manifestLines.join('\n'), { name: 'info-sheet.txt' });
    }

    await recordEvent({
      action: mode === 'handoff' ? 'DOWNLOAD_HANDOFF' : 'DOWNLOAD_WORKING_PULL',
      actorId: req.user.id,
      entityType: 'Song',
      entityId: songId,
      projectId: song.projectId,
      metadata: { tracksIncluded: selections.length, mixIncluded: willIncludeMix },
      message: `${req.user.name} downloaded a ${mode === 'handoff' ? 'handoff' : 'working pull'} export of "${song.title}".`,
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
  exportLimiter,
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
                  takes: {
                    include: {
                      performedBy: { select: { name: true } },
                      storageConfig: true,
                    },
                  },
                },
              },
              mixes: { include: { storageConfig: true } },
            },
          },
        },
      });
      if (!project) {
        return res.status(404).json({ error: `No project found with id ${projectId}.` });
      }

      const zipName = `${sanitizeExportSegment(project.name).replace(/\s+/g, '_')}_full_archive.zip`;
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
        // Sanitized once per song/track and reused for both the zip path
        // and the manifest, so the two can't disagree about what a take
        // belongs to.
        const songSegment = sanitizeExportSegment(song.title);
        manifestLines.push(`## ${song.title}`);
        for (const track of song.tracks) {
          const trackSegment = sanitizeExportSegment(track.name);
          manifestLines.push(`  ${track.name}:`);
          for (const take of track.takes) {
            const result = await getReadStream(take.storageConfig, take.storageKey);
            if (result) {
              const filename = `${songSegment}/${trackSegment}/Take${take.takeNumber}.wav`;
              archive.append(result.stream, { name: filename });
            }
            const isDefault = take.id === track.currentTakeId ? ' (was current default)' : '';
            manifestLines.push(
              `    Take ${take.takeNumber} — performed by ${take.performedBy?.name || 'unknown'}${isDefault}`
            );
          }
        }
        for (const mix of song.mixes) {
          const result = await getReadStream(mix.storageConfig, mix.storageKey);
          if (result) {
            const filename = `${songSegment}/Mix_v${mix.mixNumber}.wav`;
            archive.append(result.stream, { name: filename });
          }
          manifestLines.push(`  Mix v${mix.mixNumber} — ${mix.status}`);
        }
        manifestLines.push('');
      }

      archive.append(manifestLines.join('\n'), { name: 'manifest.txt' });

      await recordEvent({
        action: 'DOWNLOAD_ARCHIVE',
        actorId: req.user.id,
        entityType: 'Project',
        entityId: projectId,
        projectId,
        message: `${req.user.name} downloaded a full archive of "${project.name}".`,
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
