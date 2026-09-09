// Pure unit tests for middleware/verifyOrigin.js — no DB, no server, no
// real HTTP: exercised directly with mock req/res objects.

const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.CLIENT_ORIGIN = 'http://localhost:5173';
// constants.js reads CLIENT_ORIGIN at require time, so it must be set
// before either of these are required for the first time.
const verifyOrigin = require('../src/middleware/verifyOrigin');

function run(method, origin) {
  const req = { method, headers: origin ? { origin } : {} };
  let statusCode = null;
  let body = null;
  let nextCalled = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };
  const next = () => {
    nextCalled = true;
  };
  verifyOrigin(req, res, next);
  return { statusCode, body, nextCalled };
}

test('GET/HEAD/OPTIONS always pass through, regardless of Origin', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    const result = run(method, 'http://evil.example.com');
    assert.equal(result.nextCalled, true);
    assert.equal(result.statusCode, null);
  }
});

test('POST with a mismatched Origin is rejected 403 before reaching the route', () => {
  const result = run('POST', 'http://evil.example.com');
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 403);
});

test('POST with the matching Origin passes through', () => {
  const result = run('POST', 'http://localhost:5173');
  assert.equal(result.nextCalled, true);
  assert.equal(result.statusCode, null);
});

test('POST with no Origin header passes through (non-CSRF case)', () => {
  const result = run('POST', undefined);
  assert.equal(result.nextCalled, true);
  assert.equal(result.statusCode, null);
});
