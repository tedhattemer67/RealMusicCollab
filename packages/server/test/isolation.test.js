// Step 3: every project-scoped read/write route rejects a user who has no
// membership on the resource's project. A non-member should not be able to
// tell the resource even exists (reads -> 404), and should not be able to
// act on it (writes -> 403).

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

// A project the caller is NOT in, fully populated, plus an outsider account.
async function fixture() {
  const owner = await h.createUser({ instanceRole: 'VIEWER' });
  const project = await h.createProject();
  await h.addMember(owner, project, 'CONTRIBUTOR');
  const song = await h.createSong(project);
  const storage = await h.createStorageConfig();
  const { track, take } = await h.createTrackWithTake(song, owner, storage);

  const outsider = await h.createUser({ instanceRole: 'CONTRIBUTOR' });
  const outsiderCookie = await h.loginCookie(outsider);

  return { owner, project, song, track, take, outsider, outsiderCookie };
}

test('non-member reads are 404 across every scoped GET', async () => {
  const f = await fixture();
  const c = f.outsiderCookie;
  const gets = [
    `/api/projects/${f.project.id}`,
    `/api/tracks/${f.track.id}/takes`,
    `/api/takes/${f.take.id}/approvals`,
    `/api/mixes/00000000-0000-0000-0000-000000000000/approvals`, // bad id also 404, not 200
    `/api/songs/${f.song.id}/mixes`,
    `/api/songs/${f.song.id}/unfreeze-requests`,
    `/api/songs/${f.song.id}/annotations`,
    `/api/tracks/${f.track.id}/annotations`,
    `/api/takes/${f.take.id}/annotations`,
    `/api/songs/${f.song.id}/todos`,
    `/api/tracks/${f.track.id}/todos`,
    `/api/projects/${f.project.id}/todos`,
    `/api/takes/${f.take.id}/stream`,
  ];
  for (const path of gets) {
    const res = await h.api('GET', path, { cookie: c });
    assert.equal(res.status, 404, `${path} should be 404 for a non-member`);
  }
});

test('non-member writes are refused (403) across scoped POSTs', async () => {
  const f = await fixture();
  const c = f.outsiderCookie;
  const posts = [
    [`/api/songs/${f.song.id}/annotations`, { body: 'hi' }],
    [`/api/takes/${f.take.id}/annotations`, { body: 'hi' }],
    [`/api/songs/${f.song.id}/todos`, { body: 'do it' }],
    [`/api/songs/${f.song.id}/export`, { mode: 'working' }],
    [`/api/takes/${f.take.id}/approvals`, {}],
    [`/api/songs/${f.song.id}/mixes`, {}],
  ];
  for (const [path, body] of posts) {
    const res = await h.api('POST', path, { cookie: c, body });
    assert.ok(
      res.status === 403 || res.status === 404,
      `${path} should be 403/404 for a non-member, got ${res.status}`
    );
  }
});

test('member CAN read the project tree; non-member cannot', async () => {
  const f = await fixture();

  const memberRes = await h.api('GET', `/api/projects/${f.project.id}`, {
    cookie: await h.loginCookie(f.owner),
  });
  assert.equal(memberRes.status, 200);
  assert.equal(memberRes.body.id, f.project.id);
  // The frontend gates write affordances on this.
  assert.equal(memberRes.body.myRole, 'CONTRIBUTOR');

  const outsiderRes = await h.api('GET', `/api/projects/${f.project.id}`, {
    cookie: f.outsiderCookie,
  });
  assert.equal(outsiderRes.status, 404);
});

test('VIEWER member can comment but not create a to-do', async () => {
  const f = await fixture();
  const viewer = await h.createUser({ instanceRole: 'VIEWER' });
  await h.addMember(viewer, f.project, 'VIEWER');
  const cookie = await h.loginCookie(viewer);

  const comment = await h.api('POST', `/api/songs/${f.song.id}/annotations`, {
    cookie,
    body: { body: 'sounds great' },
  });
  assert.equal(comment.status, 201);

  const todo = await h.api('POST', `/api/songs/${f.song.id}/todos`, {
    cookie,
    body: { body: 'redo the bridge' },
  });
  assert.equal(todo.status, 403);
});

test('instance ADMIN who is not a member still reads and writes freely', async () => {
  const f = await fixture();
  const admin = await h.createUser({ instanceRole: 'ADMIN' });
  const cookie = await h.loginCookie(admin);

  const read = await h.api('GET', `/api/projects/${f.project.id}`, { cookie });
  assert.equal(read.status, 200);
  assert.equal(read.body.myRole, 'ADMIN');

  const todo = await h.api('POST', `/api/songs/${f.song.id}/todos`, {
    cookie,
    body: { body: 'ship it' },
  });
  assert.equal(todo.status, 201);
});
