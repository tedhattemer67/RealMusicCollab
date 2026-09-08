// Shared setup for the integration tests. Requiring this module:
//   1. points DATABASE_URL at the dedicated rmc_test database (before the
//      Prisma client is constructed anywhere), and
//   2. exposes helpers to reset the DB, seed users/projects/memberships,
//      mint a logged-in session cookie, and make HTTP calls against the app.
//
// Run with:  npm test   (from the repo root)

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://rmc:rmcdevpass123@localhost:5432/rmc_test';
// Keep uploads off S3 if any test ever exercises them.
process.env.STORAGE_ADAPTER = 'LOCAL';

const http = require('http');
const app = require('../src/index');
const prisma = require('../src/prisma');
const { SESSION_COOKIE_NAME } = require('../src/constants');

let server;
let baseUrl;

async function startServer() {
  if (server) return baseUrl;
  await new Promise((resolve) => {
    server = http.createServer(app).listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  return baseUrl;
}

async function stopServer() {
  if (server) await new Promise((r) => server.close(r));
  server = null;
  // recordEvent fires notifyChannels() without awaiting it; give any in-flight
  // one a moment to finish so it doesn't hit a disconnected client and log noise.
  await new Promise((r) => setTimeout(r, 150));
  await prisma.$disconnect();
}

// Wipe every table except Prisma's migration bookkeeping. Discovered
// dynamically so a new model doesn't silently escape the reset.
async function resetDb() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  );
  if (rows.length === 0) return;
  const list = rows.map((r) => `"${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

let seq = 0;
function uniq(prefix) {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

async function createUser({ instanceRole = 'VIEWER', name, active = true } = {}) {
  const n = name || uniq('user');
  return prisma.user.create({
    data: { name: n, email: `${n}@example.test`, instanceRole, active },
  });
}

// Real Session row -> the same cookie requireAuth reads in production.
async function loginCookie(user) {
  const session = await prisma.session.create({
    data: { userId: user.id, expiresAt: new Date(Date.now() + 3600_000) },
  });
  return `${SESSION_COOKIE_NAME}=${session.id}`;
}

async function createProject({ name } = {}) {
  return prisma.project.create({ data: { name: name || uniq('project') } });
}

async function addMember(user, project, role = 'VIEWER') {
  return prisma.membership.create({
    data: { userId: user.id, projectId: project.id, role },
  });
}

async function createSong(project, { title } = {}) {
  return prisma.song.create({
    data: { projectId: project.id, title: title || uniq('song') },
  });
}

async function createStorageConfig() {
  return prisma.storageConfig.create({
    data: { type: 'LOCAL', label: 'test', isDefault: true, settings: { rootPath: '/tmp/test' } },
  });
}

// Song already created by the caller; returns { track, take } with the take
// wired up as the track's current default.
async function createTrackWithTake(song, uploader, storageConfig) {
  const track = await prisma.track.create({
    data: { songId: song.id, name: uniq('track') },
  });
  const take = await prisma.take.create({
    data: {
      trackId: track.id,
      takeNumber: 1,
      storageConfigId: storageConfig.id,
      storageKey: `${track.id}/take1.wav`,
      performedById: uploader.id,
      uploadedById: uploader.id,
    },
  });
  await prisma.track.update({ where: { id: track.id }, data: { currentTakeId: take.id } });
  return { track, take };
}

// Thin fetch wrapper: pass a cookie string to authenticate, a plain object
// body to send JSON. Returns { status, body }.
async function api(method, path, { cookie, body } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let parsed = null;
  const text = await res.text();
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

module.exports = {
  prisma,
  startServer,
  stopServer,
  resetDb,
  createUser,
  loginCookie,
  createProject,
  addMember,
  createSong,
  createStorageConfig,
  createTrackWithTake,
  api,
};
