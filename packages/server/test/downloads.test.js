// GET /api/takes/:takeId/download — same access rule as /stream (any member
// of the project, with drafts hidden from non-uploader roles), but forces a
// real file download instead of playing back inline, so a member can pull
// just one track's current take into their own DAW.

const fs = require('fs');
const path = require('path');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let baseUrl;
before(async () => {
  baseUrl = await h.startServer();
});
after(async () => {
  await h.stopServer();
});
beforeEach(async () => {
  await h.resetDb();
});

test('download: a draft take 404s for a non-uploader role, same as stream', async () => {
  const uploader = await h.createUser({ instanceRole: 'VIEWER' });
  const project = await h.createProject();
  await h.addMember(uploader, project, 'CONTRIBUTOR');
  const song = await h.createSong(project);
  const storage = await h.createStorageConfig();
  const { track } = await h.createTrackWithTake(song, uploader, storage);
  const draftTake = await h.prisma.take.create({
    data: {
      trackId: track.id,
      takeNumber: 2,
      storageConfigId: storage.id,
      storageKey: `${track.id}/take2.wav`,
      performedById: uploader.id,
      uploadedById: uploader.id,
      readyForFeedback: false,
    },
  });
  const viewer = await h.createUser({ instanceRole: 'VIEWER' });
  await h.addMember(viewer, project, 'VIEWER');

  const asViewer = await h.api('GET', `/api/takes/${draftTake.id}/download`, {
    cookie: await h.loginCookie(viewer),
  });
  assert.equal(asViewer.status, 404);
});

test('download: a non-member is refused, same 404-hides-existence rule as stream', async () => {
  const uploader = await h.createUser({ instanceRole: 'VIEWER' });
  const project = await h.createProject();
  await h.addMember(uploader, project, 'CONTRIBUTOR');
  const song = await h.createSong(project);
  const storage = await h.createStorageConfig();
  const { take } = await h.createTrackWithTake(song, uploader, storage);
  const outsider = await h.createUser({ instanceRole: 'VIEWER' });

  const res = await h.api('GET', `/api/takes/${take.id}/download`, {
    cookie: await h.loginCookie(outsider),
  });
  assert.equal(res.status, 404);
});

test('download: a real take streams back with an attachment Content-Disposition and a sane filename', async () => {
  const uploader = await h.createUser({ instanceRole: 'VIEWER' });
  const project = await h.createProject();
  await h.addMember(uploader, project, 'CONTRIBUTOR');
  const song = await h.createSong(project);
  const storage = await h.createStorageConfig();
  const { track, take } = await h.createTrackWithTake(song, uploader, storage);

  // createTrackWithTake names the track uniquely (e.g. "track-<ts>-<n>") and
  // wires storageKey to "<trackId>/take1.wav" — write real bytes there so
  // this exercises the actual local-file path, not just the draft gate.
  const localStorageRoot = path.join(__dirname, '..', 'local-storage');
  const absolutePath = path.join(localStorageRoot, take.storageKey);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, Buffer.from('fake wav bytes'));

  try {
    const res = await fetch(`${baseUrl}/api/takes/${take.id}/download`, {
      headers: { Cookie: await h.loginCookie(uploader) },
    });
    assert.equal(res.status, 200);
    const disposition = res.headers.get('content-disposition');
    assert.match(disposition, /^attachment; filename="/);
    assert.match(disposition, new RegExp(`_Take1\\.wav"$`));
    const body = await res.text();
    assert.equal(body, 'fake wav bytes');
  } finally {
    // Clean up the whole per-track directory, not just the file — it only
    // ever holds this one test take, and otherwise every run leaves behind
    // an empty local-storage/<trackId>/ directory.
    fs.rmSync(path.dirname(absolutePath), { recursive: true, force: true });
  }
});
