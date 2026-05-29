// tests/extractHandler.unit.test.js
//
// Unit tests for the /extract request lifecycle, including the hub consume
// gate. auth.consume and extract are injected mocks — no network, no DB.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createExtractHandler } = require('../lib/extractHandler.js');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

const VALID_REQ = () => ({ centralSessionId: 'sess-1', body: { text: 'These are some project notes.' } });

function deps(overrides = {}) {
  return {
    auth: { consume: async () => ({ ok: true, remaining: 24 }) },
    extract: async () => ({ risks: [], assumptions: [], issues: [], dependencies: [] }),
    apiKey: 'sk-test',
    model: 'claude-sonnet-4-5',
    ...overrides,
  };
}

test('rejects short text with 400 and never consumes', async () => {
  let consumed = false;
  const handler = createExtractHandler(deps({ auth: { consume: async () => { consumed = true; return { ok: true }; } } }));
  const res = mockRes();
  await handler({ centralSessionId: 's', body: { text: 'short' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(consumed, false);
});

test('returns 500 when apiKey missing, before consuming', async () => {
  let consumed = false;
  const handler = createExtractHandler(deps({ apiKey: undefined, auth: { consume: async () => { consumed = true; return { ok: true }; } } }));
  const res = mockRes();
  await handler(VALID_REQ(), res);
  assert.equal(res.statusCode, 500);
  assert.equal(consumed, false);
});

test('on ok, calls extract and returns 200 with remaining threaded through', async () => {
  let extracted = false;
  const handler = createExtractHandler(deps({
    extract: async () => { extracted = true; return { risks: [{ title: 'r' }] }; },
    auth: { consume: async () => ({ ok: true, remaining: 7 }) },
  }));
  const res = mockRes();
  await handler(VALID_REQ(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(extracted, true);
  assert.equal(res.body.remaining, 7);
  assert.deepEqual(res.body.risks, [{ title: 'r' }]);
});

test('unlimited grant (remaining null) still returns 200 and calls extract', async () => {
  let extracted = false;
  const handler = createExtractHandler(deps({
    extract: async () => { extracted = true; return { risks: [] }; },
    auth: { consume: async () => ({ ok: true, remaining: null }) },
  }));
  const res = mockRes();
  await handler(VALID_REQ(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(extracted, true);
  assert.equal(res.body.remaining, null);
});

test('quota_exceeded returns 402 and never calls extract', async () => {
  let extracted = false;
  const handler = createExtractHandler(deps({
    extract: async () => { extracted = true; return {}; },
    auth: { consume: async () => ({ ok: false, reason: 'quota_exceeded' }) },
  }));
  const res = mockRes();
  await handler(VALID_REQ(), res);
  assert.equal(res.statusCode, 402);
  assert.equal(res.body.remaining, 0);
  assert.equal(extracted, false);
});

test('not_entitled returns 403 and never calls extract', async () => {
  let extracted = false;
  const handler = createExtractHandler(deps({
    extract: async () => { extracted = true; return {}; },
    auth: { consume: async () => ({ ok: false, reason: 'not_entitled' }) },
  }));
  const res = mockRes();
  await handler(VALID_REQ(), res);
  assert.equal(res.statusCode, 403);
  assert.equal(extracted, false);
});

test('unreachable hub fails closed with 503 and never calls extract', async () => {
  let extracted = false;
  const handler = createExtractHandler(deps({
    extract: async () => { extracted = true; return {}; },
    auth: { consume: async () => ({ ok: false, reason: 'unreachable' }) },
  }));
  const res = mockRes();
  await handler(VALID_REQ(), res);
  assert.equal(res.statusCode, 503);
  assert.equal(extracted, false);
});

test('any other consume failure also fails closed with 503', async () => {
  const handler = createExtractHandler(deps({ auth: { consume: async () => ({ ok: false, reason: 'error' }) } }));
  const res = mockRes();
  await handler(VALID_REQ(), res);
  assert.equal(res.statusCode, 503);
});

test('extract throwing after consume returns 502 (no refund)', async () => {
  const handler = createExtractHandler(deps({ extract: async () => { throw new Error('boom'); } }));
  const res = mockRes();
  await handler(VALID_REQ(), res);
  assert.equal(res.statusCode, 502);
});
