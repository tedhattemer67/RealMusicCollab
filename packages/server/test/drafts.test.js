// A take marked readyForFeedback:false ("private draft") should be
// invisible to Reviewer/Viewer — not just badged as a draft while still
// being listed and streamable. Covers both the takes-list route and the
// stream route (see routes/takes.js and routes/stream.js).

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

before(async () => {
  await h.startServer();
});
after(async () => {
  await h.stopServer();
});
beforeEach(async () => {
  await h.resetDb();
});

async function fixture() {
  const uploader = await h.createUser({ instanceRole: 'VIEWER' });
  const project = await h.createProject();
  await h.addMember(uploader, project, 'CONTRIBUTOR');
  const song = await h.createSong(project);
  const storage = await h.createStorageConfig();
  const { track, take: readyTake } = await h.createTrackWithTake(song, uploader, storage);

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

  const reviewer = await h.createUser({ instanceRole: 'VIEWER' });
  await h.addMember(reviewer, project, 'REVIEWER');
  const viewer = await h.createUser({ instanceRole: 'VIEWER' });
  await h.addMember(viewer, project, 'VIEWER');

  return { uploader, project, song, track, readyTake, draftTake, reviewer, viewer };
}

test('takes list: Contributor sees a draft take, Reviewer/Viewer do not', async () => {
  const f = await fixture();

  const asUploader = await h.api('GET', `/api/tracks/${f.track.id}/takes`, {
    cookie: await h.loginCookie(f.uploader),
  });
  assert.equal(asUploader.status, 200);
  assert.equal(asUploader.body.length, 2);

  const asReviewer = await h.api('GET', `/api/tracks/${f.track.id}/takes`, {
    cookie: await h.loginCookie(f.reviewer),
  });
  assert.equal(asReviewer.status, 200);
  assert.equal(asReviewer.body.length, 1);
  assert.equal(asReviewer.body[0].id, f.readyTake.id);

  const asViewer = await h.api('GET', `/api/tracks/${f.track.id}/takes`, {
    cookie: await h.loginCookie(f.viewer),
  });
  assert.equal(asViewer.status, 200);
  assert.equal(asViewer.body.length, 1);
});

test('stream: a draft take 404s for Reviewer/Viewer but not for the uploader role', async () => {
  const f = await fixture();

  const asViewer = await h.api('GET', `/api/takes/${f.draftTake.id}/stream`, {
    cookie: await h.loginCookie(f.viewer),
  });
  assert.equal(asViewer.status, 404);
  assert.match(asViewer.body.error, /No take found/);

  // Contributor clears the draft gate and reaches the actual file lookup —
  // there's no real file on disk in this test, so it 404s too, but for a
  // different reason, proving it got past the draft check.
  const asContributor = await h.api('GET', `/api/takes/${f.draftTake.id}/stream`, {
    cookie: await h.loginCookie(f.uploader),
  });
  assert.equal(asContributor.status, 404);
  assert.match(asContributor.body.error, /File not found on disk/);
});

test('project tree: a draft current take is hidden from Viewer, shown to Contributor', async () => {
  const f = await fixture();
  await h.prisma.track.update({ where: { id: f.track.id }, data: { currentTakeId: f.draftTake.id } });

  const asViewer = await h.api('GET', `/api/projects/${f.project.id}`, {
    cookie: await h.loginCookie(f.viewer),
  });
  assert.equal(asViewer.status, 200);
  const viewerTrack = asViewer.body.songs[0].tracks.find((t) => t.id === f.track.id);
  assert.equal(viewerTrack.currentTake, null);

  const asContributor = await h.api('GET', `/api/projects/${f.project.id}`, {
    cookie: await h.loginCookie(f.uploader),
  });
  const contributorTrack = asContributor.body.songs[0].tracks.find((t) => t.id === f.track.id);
  assert.equal(contributorTrack.currentTake.id, f.draftTake.id);
});
