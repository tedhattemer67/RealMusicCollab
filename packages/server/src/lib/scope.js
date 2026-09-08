const prisma = require('../prisma');

// Scope extractors for requireRole's second argument. Each takes the Express
// `req` and returns { projectId } or { songId } — whichever the downstream
// getEffectiveRole needs to resolve the caller's role for that route.
//
// When the entity id in the URL doesn't resolve (bad/stale id, or an id from
// another project the caller can't see), the extractor returns an object with
// undefined values. getEffectiveRole then finds no grant and returns null, so
// requireRole rejects — which is the right outcome for an unknown id anyway,
// and avoids leaking whether the id exists.
//
// These replace the ad-hoc resolveSongIdForX helpers that were copy-pasted
// across routes/takes.js, routes/tracks.js, routes/approvals.js, routes/mixes.js.

function fromProjectParam(req) {
  return { projectId: req.params.projectId };
}

function fromSongParam(req) {
  return { songId: req.params.songId };
}

async function fromTrackParam(req) {
  const track = await prisma.track.findUnique({
    where: { id: req.params.trackId },
    select: { songId: true },
  });
  return { songId: track ? track.songId : undefined };
}

async function fromTakeParam(req) {
  const take = await prisma.take.findUnique({
    where: { id: req.params.takeId },
    select: { track: { select: { songId: true } } },
  });
  return { songId: take ? take.track.songId : undefined };
}

async function fromMixParam(req) {
  const mix = await prisma.mix.findUnique({
    where: { id: req.params.mixId },
    select: { songId: true },
  });
  return { songId: mix ? mix.songId : undefined };
}

// A Todo attaches to exactly one of Project / Song / Track (nullable FKs,
// "exactly one" enforced in app code). Walk whichever one is set up to a
// projectId or songId.
async function fromTodoParam(req) {
  const todo = await prisma.todo.findUnique({
    where: { id: req.params.todoId },
    select: { projectId: true, songId: true, trackId: true },
  });
  if (!todo) return {};
  if (todo.projectId) return { projectId: todo.projectId };
  if (todo.songId) return { songId: todo.songId };
  if (todo.trackId) {
    const track = await prisma.track.findUnique({
      where: { id: todo.trackId },
      select: { songId: true },
    });
    return { songId: track ? track.songId : undefined };
  }
  return {};
}

module.exports = {
  fromProjectParam,
  fromSongParam,
  fromTrackParam,
  fromTakeParam,
  fromMixParam,
  fromTodoParam,
};
