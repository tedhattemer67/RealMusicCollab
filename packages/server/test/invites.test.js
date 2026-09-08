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
