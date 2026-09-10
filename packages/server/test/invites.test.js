// Step 5: invites are instance-ADMIN only; a projectless invite must be
// ADMIN-role (creates an instance admin); a project invite creates a
// Membership on redeem, which immediately grants project access.

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

async function adminCookie() {
  return h.loginCookie(await h.createUser({ instanceRole: 'ADMIN' }));
}

test('a non-admin cannot create an invite', async () => {
  const u = await h.createUser({ instanceRole: 'CONTRIBUTOR' });
  const res = await h.api('POST', '/api/invites', {
    cookie: await h.loginCookie(u),
    body: { role: 'VIEWER', projectId: (await h.createProject()).id },
  });
  assert.equal(res.status, 403);
});

test('a projectless invite must be role ADMIN', async () => {
  const cookie = await adminCookie();

  const bad = await h.api('POST', '/api/invites', { cookie, body: { role: 'VIEWER' } });
  assert.equal(bad.status, 400);

  const ok = await h.api('POST', '/api/invites', { cookie, body: { role: 'ADMIN' } });
  assert.equal(ok.status, 201);
});

test('a project invite with an unknown projectId is 404', async () => {
  const cookie = await adminCookie();
  const res = await h.api('POST', '/api/invites', {
    cookie,
    body: { role: 'VIEWER', projectId: 'nope' },
  });
  assert.equal(res.status, 404);
});

test('redeeming a project invite creates a member who can then see the project', async () => {
  const cookie = await adminCookie();
  const project = await h.createProject();

  const created = await h.api('POST', '/api/invites', {
    cookie,
    body: { role: 'CONTRIBUTOR', projectId: project.id },
  });
  assert.equal(created.status, 201);
  const token = created.body.token;

  const redeem = await h.api('POST', `/api/invites/${token}/redeem`, {
    body: { name: 'New Person', email: 'new@example.test', password: 'password123' },
  });
  assert.equal(redeem.status, 201);

  // The redeem response sets the session cookie.
  const user = await h.prisma.user.findUnique({ where: { email: 'new@example.test' } });
  const session = await h.prisma.session.findFirst({ where: { userId: user.id } });
  const userCookie = `session_id=${session.id}`;

  const membership = await h.prisma.membership.findFirst({ where: { userId: user.id } });
  assert.equal(membership.projectId, project.id);
  assert.equal(membership.role, 'CONTRIBUTOR');

  const projRes = await h.api('GET', `/api/projects/${project.id}`, { cookie: userCookie });
  assert.equal(projRes.status, 200);
});

test('an existing logged-in user redeeming a project invite joins as a member, no new account', async () => {
  const adminCookie2 = await adminCookie();
  const projectA = await h.createProject();
  const projectB = await h.createProject();

  const existingUser = await h.createUser({ instanceRole: 'VIEWER' });
  await h.addMember(existingUser, projectA, 'CONTRIBUTOR');
  const existingCookie = await h.loginCookie(existingUser);

  const created = await h.api('POST', '/api/invites', {
    cookie: adminCookie2,
    body: { role: 'REVIEWER', projectId: projectB.id },
  });
  assert.equal(created.status, 201);

  const redeem = await h.api('POST', `/api/invites/${created.body.token}/redeem`, {
    cookie: existingCookie,
    body: {},
  });
  assert.equal(redeem.status, 200);
  assert.equal(redeem.body.id, existingUser.id);
  assert.equal(redeem.body.joinedProjectId, projectB.id);

  const userCount = await h.prisma.user.count({ where: { email: existingUser.email } });
  assert.equal(userCount, 1);

  const membership = await h.prisma.membership.findUnique({
    where: { userId_projectId: { userId: existingUser.id, projectId: projectB.id } },
  });
  assert.equal(membership.role, 'REVIEWER');

  const projRes = await h.api('GET', `/api/projects/${projectB.id}`, { cookie: existingCookie });
  assert.equal(projRes.status, 200);
});

test('an existing logged-in user redeeming an invite for a project they already belong to gets 409, invite stays usable', async () => {
  const cookie = await adminCookie();
  const project = await h.createProject();

  const existingUser = await h.createUser({ instanceRole: 'VIEWER' });
  await h.addMember(existingUser, project, 'VIEWER');
  const existingCookie = await h.loginCookie(existingUser);

  const created = await h.api('POST', '/api/invites', {
    cookie,
    body: { role: 'CONTRIBUTOR', projectId: project.id },
  });

  const redeem = await h.api('POST', `/api/invites/${created.body.token}/redeem`, {
    cookie: existingCookie,
    body: {},
  });
  assert.equal(redeem.status, 409);

  const invite = await h.prisma.invite.findUnique({ where: { id: created.body.id } });
  assert.equal(invite.usedAt, null);
});

test('an existing user hitting a signup redeem gets a clear accountExists error instead of a raw conflict', async () => {
  const cookie = await adminCookie();
  const project = await h.createProject();
  const existingUser = await h.createUser({ instanceRole: 'VIEWER' });

  const created = await h.api('POST', '/api/invites', {
    cookie,
    body: { role: 'VIEWER', projectId: project.id },
  });

  const redeem = await h.api('POST', `/api/invites/${created.body.token}/redeem`, {
    body: { name: 'Someone', email: existingUser.email, password: 'password123' },
  });
  assert.equal(redeem.status, 409);
  assert.equal(redeem.body.accountExists, true);
});

test('an invite can only be redeemed once', async () => {
  const cookie = await adminCookie();
  const project = await h.createProject();
  const created = await h.api('POST', '/api/invites', {
    cookie,
    body: { role: 'VIEWER', projectId: project.id },
  });
  const token = created.body.token;

  const first = await h.api('POST', `/api/invites/${token}/redeem`, {
    body: { name: 'A', email: 'a@example.test', password: 'password123' },
  });
  assert.equal(first.status, 201);

  const second = await h.api('POST', `/api/invites/${token}/redeem`, {
    body: { name: 'B', email: 'b@example.test', password: 'password123' },
  });
  assert.equal(second.status, 410);
});
