// Pure unit tests for lib/ssrf.js — no DB, no server. Real DNS resolution
// happens for the hostname cases, so this needs network access, same as
// the app itself does when it actually posts to a webhook.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertPublicHttpUrl } = require('../src/lib/ssrf');

async function isBlocked(url) {
  try {
    await assertPublicHttpUrl(url);
    return false;
  } catch {
    return true;
  }
}

test('blocks IP-literal private/loopback/link-local/metadata URLs', async () => {
  assert.equal(await isBlocked('http://127.0.0.1:9999/hook'), true);
  assert.equal(await isBlocked('http://10.0.0.5/hook'), true);
  assert.equal(await isBlocked('http://192.168.1.5/hook'), true);
  assert.equal(await isBlocked('http://169.254.169.254/latest/meta-data/'), true);
});

test('blocks a hostname that resolves to localhost', async () => {
  assert.equal(await isBlocked('http://localhost/hook'), true);
});

test('rejects a non-http(s) scheme', async () => {
  assert.equal(await isBlocked('file:///etc/passwd'), true);
  assert.equal(await isBlocked('ftp://example.com/hook'), true);
});

test('rejects a garbage URL', async () => {
  assert.equal(await isBlocked('not a url'), true);
});

test('allows a real public webhook host', async () => {
  assert.equal(await isBlocked('https://hooks.slack.com/services/x'), false);
});
