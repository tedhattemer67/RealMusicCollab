// Step 4: project membership management. Instance-ADMIN only — not even a
// project-level ADMIN member can manage the roster.

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

test('a project-level ADMIN member cannot manage the roster', async () => {
  const project = await h.createProject();
  const projectAdmin = await h.createUser({ instanceRole: 'VIEWER' });
  await h.addMember(projectAdmin, project, 'ADMIN');
  const cookie = await h.loginCookie(projectAdmin);
  const target = await h.createUser();

  const paths = [
    ['GET', `/api/projects/${project.id}/members`, undefined],
    ['POST', `/api/projects/${project.id}/members`, { userId: target.id, role: 'VIEWER' }],
    ['PATCH', `/api/projects/${project.id}/members/${target.id}`, { role: 'VIEWER' }],
    ['DELETE', `/api/projects/${project.id}/members/${target.id}`, undefined],
  ];
  for (const [method, path, body] of paths) {
    const res = await h.api(method, path, { cookie, body });
    assert.equal(res.status, 403, `${method} ${path} should be 403 for a project admin`);
  }
});

test('instance admin can add, list, re-role, and remove a member', async () => {
  const admin = await h.createUser({ instanceRole: 'ADMIN' });
  const cookie = await h.loginCookie(admin);
  const project = await h.createProject();
  const user = await h.createUser({ instanceRole: 'VIEWER' });

  const add = await h.api('POST', `/api/projects/${project.id}/members`, {
    cookie,
    body: { userId: user.id, role: 'CONTRIBUTOR' },
  });
  assert.equal(add.status, 201);
  assert.equal(add.body.role, 'CONTRIBUTOR');

  const list = await h.api('GET', `/api/projects/${project.id}/members`, { cookie });
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].userId, user.id);

  const patch = await h.api('PATCH', `/api/projects/${project.id}/members/${user.id}`, {
    cookie,
    body: { role: 'REVIEWER' },
  });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.role, 'REVIEWER');

  const del = await h.api('DELETE', `/api/projects/${project.id}/members/${user.id}`, { cookie });
  assert.equal(del.status, 204);

  const listAfter = await h.api('GET', `/api/projects/${project.id}/members`, { cookie });
  assert.equal(listAfter.body.length, 0);
});

test('add-member validation: duplicate 409, bad role 400, unknown user 404', async () => {
  const admin = await h.createUser({ instanceRole: 'ADMIN' });
  const cookie = await h.loginCookie(admin);
  const project = await h.createProject();
  const user = await h.createUser();

  await h.api('POST', `/api/projects/${project.id}/members`, {
    cookie,
    body: { userId: user.id, role: 'VIEWER' },
  });
  const dup = await h.api('POST', `/api/projects/${project.id}/members`, {
    cookie,
    body: { userId: user.id, role: 'VIEWER' },
  });
  assert.equal(dup.status, 409);

  const badRole = await h.api('POST', `/api/projects/${project.id}/members`, {
    cookie,
    body: { userId: user.id, role: 'SUPERUSER' },
  });
  assert.equal(badRole.status, 400);

  const noUser = await h.api('POST', `/api/projects/${project.id}/members`, {
    cookie,
    body: { userId: 'does-not-exist', role: 'VIEWER' },
  });
  assert.equal(noUser.status, 404);
});

test('membership round-trip flips project access on and off', async () => {
  const admin = await h.createUser({ instanceRole: 'ADMIN' });
  const adminCookie = await h.loginCookie(admin);
  const project = await h.createProject();
  const user = await h.createUser({ instanceRole: 'VIEWER' });
  const userCookie = await h.loginCookie(user);

  // Before: no access.
  let r = await h.api('GET', `/api/projects/${project.id}`, { cookie: userCookie });
  assert.equal(r.status, 404);

  // Add as member -> access.
  await h.api('POST', `/api/projects/${project.id}/members`, {
    cookie: adminCookie,
    body: { userId: user.id, role: 'VIEWER' },
  });
  r = await h.api('GET', `/api/projects/${project.id}`, { cookie: userCookie });
  assert.equal(r.status, 200);

  // Remove -> access gone again.
  await h.api('DELETE', `/api/projects/${project.id}/members/${user.id}`, { cookie: adminCookie });
  r = await h.api('GET', `/api/projects/${project.id}`, { cookie: userCookie });
  assert.equal(r.status, 404);
});

test('GET /users without a project is instance-admin only', async () => {
  const member = await h.createUser({ instanceRole: 'CONTRIBUTOR' });
  const memberRes = await h.api('GET', '/api/users', { cookie: await h.loginCookie(member) });
  assert.equal(memberRes.status, 403);

  const admin = await h.createUser({ instanceRole: 'ADMIN' });
  const adminRes = await h.api('GET', '/api/users', { cookie: await h.loginCookie(admin) });
  assert.equal(adminRes.status, 200);
  assert.ok(Array.isArray(adminRes.body));
});

test('GET /users?projectId returns the roster to members, 404 to outsiders', async () => {
  const project = await h.createProject();
  const member = await h.createUser({ instanceRole: 'VIEWER' });
  await h.addMember(member, project, 'VIEWER');
  const outsider = await h.createUser({ instanceRole: 'CONTRIBUTOR' });

  const memberRes = await h.api('GET', `/api/users?projectId=${project.id}`, {
    cookie: await h.loginCookie(member),
  });
  assert.equal(memberRes.status, 200);
  assert.equal(memberRes.body[0].id, member.id);

  const outsiderRes = await h.api('GET', `/api/users?projectId=${project.id}`, {
    cookie: await h.loginCookie(outsider),
  });
  assert.equal(outsiderRes.status, 404);
});
