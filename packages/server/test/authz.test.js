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

// ---------------------------------------------------------------------------
// Instance ADMIN bypass
// ---------------------------------------------------------------------------

test('instance ADMIN reaches an instance-only route', async () => {
  const admin = await h.createUser({ instanceRole: 'ADMIN' });
  const cookie = await h.loginCookie(admin);
  const res = await h.api('GET', '/api/projects/all', { cookie });
  assert.equal(res.status, 200);
});

test('non-admin is refused an instance-only route regardless of instanceRole', async () => {
  for (const instanceRole of ['CONTRIBUTOR', 'REVIEWER', 'VIEWER']) {
    const u = await h.createUser({ instanceRole });
    const cookie = await h.loginCookie(u);
    const res = await h.api('GET', '/api/projects/all', { cookie });
    assert.equal(res.status, 403, `${instanceRole} should be 403`);
  }
});

// ---------------------------------------------------------------------------
// Project creation is instance-ADMIN only (a plain instanceRole is no longer
// a grant — this is the visible effect of the getEffectiveRole change)
// ---------------------------------------------------------------------------

test('CONTRIBUTOR instanceRole can no longer create a project', async () => {
  const u = await h.createUser({ instanceRole: 'CONTRIBUTOR' });
  const cookie = await h.loginCookie(u);
  const res = await h.api('POST', '/api/projects', { cookie, body: { name: 'X' } });
  assert.equal(res.status, 403);
});

test('instance ADMIN can create a project', async () => {
  const admin = await h.createUser({ instanceRole: 'ADMIN' });
  const cookie = await h.loginCookie(admin);
  const res = await h.api('POST', '/api/projects', { cookie, body: { name: 'X' } });
  assert.equal(res.status, 201);
});

// ---------------------------------------------------------------------------
// GET /api/projects is filtered to the caller's memberships
// ---------------------------------------------------------------------------

test('project list shows only projects the user is a member of', async () => {
  const [projA, projB] = [await h.createProject(), await h.createProject()];
  const userA = await h.createUser({ instanceRole: 'VIEWER' });
  await h.addMember(userA, projA, 'VIEWER');
  const cookie = await h.loginCookie(userA);

  const res = await h.api('GET', '/api/projects', { cookie });
  assert.equal(res.status, 200);
  const ids = res.body.map((p) => p.id);
  assert.deepEqual(ids, [projA.id]);
});

test('project list shows every non-hidden project to an instance ADMIN', async () => {
  const [projA, projB] = [await h.createProject(), await h.createProject()];
  const admin = await h.createUser({ instanceRole: 'ADMIN' });
  const cookie = await h.loginCookie(admin);

  const res = await h.api('GET', '/api/projects', { cookie });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.deepEqual(new Set(res.body.map((p) => p.id)), new Set([projA.id, projB.id]));
});

// ---------------------------------------------------------------------------
// A scoped write route (add a song) enforces membership + role
// ---------------------------------------------------------------------------

test('adding a song: non-member is refused', async () => {
  const proj = await h.createProject();
  const outsider = await h.createUser({ instanceRole: 'CONTRIBUTOR' });
  const cookie = await h.loginCookie(outsider);
  const res = await h.api('POST', `/api/projects/${proj.id}/songs`, {
    cookie,
    body: { title: 'Song 1' },
  });
  assert.equal(res.status, 403);
});

test('adding a song: VIEWER member is refused, CONTRIBUTOR member succeeds', async () => {
  const proj = await h.createProject();

  const viewer = await h.createUser({ instanceRole: 'VIEWER' });
  await h.addMember(viewer, proj, 'VIEWER');
  const viewerRes = await h.api('POST', `/api/projects/${proj.id}/songs`, {
    cookie: await h.loginCookie(viewer),
    body: { title: 'Song 1' },
  });
  assert.equal(viewerRes.status, 403);

  const contributor = await h.createUser({ instanceRole: 'VIEWER' });
  await h.addMember(contributor, proj, 'CONTRIBUTOR');
  const contribRes = await h.api('POST', `/api/projects/${proj.id}/songs`, {
    cookie: await h.loginCookie(contributor),
    body: { title: 'Song 2' },
  });
  assert.equal(contribRes.status, 201);
});

test('adding a song: instance ADMIN who is not a member still succeeds', async () => {
  const proj = await h.createProject();
  const admin = await h.createUser({ instanceRole: 'ADMIN' });
  const res = await h.api('POST', `/api/projects/${proj.id}/songs`, {
    cookie: await h.loginCookie(admin),
    body: { title: 'Song 1' },
  });
  assert.equal(res.status, 201);
});
