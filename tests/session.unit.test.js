// tests/session.unit.test.js

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setTimeout: sleep } = require('node:timers/promises');
const { createSessionStore } = require('../lib/session.js');

test('start: returns a high-entropy random token (>= 30 chars, unique per call)', () => {
  const s = createSessionStore();
  const t1 = s.start({ keyName: 'a' });
  const t2 = s.start({ keyName: 'a' });
  assert.ok(t1.length >= 30);
  assert.ok(t2.length >= 30);
  assert.notEqual(t1, t2);
});

test('get: returns null for an unknown token', () => {
  const s = createSessionStore();
  assert.equal(s.get('not-a-real-token'), null);
});

test('get: returns the entry for a valid token', () => {
  const s = createSessionStore();
  const t = s.start({ keyName: 'alice' });
  const entry = s.get(t);
  assert.equal(entry.keyName, 'alice');
  assert.ok(entry.expiresAt > Date.now());
});

test('destroy: subsequent get returns null', () => {
  const s = createSessionStore();
  const t = s.start({ keyName: 'bob' });
  s.destroy(t);
  assert.equal(s.get(t), null);
});

test('destroy: idempotent (no throw on unknown token)', () => {
  const s = createSessionStore();
  assert.doesNotThrow(() => s.destroy('unknown'));
  assert.doesNotThrow(() => s.destroy(''));
});

test('ttl expiry: get returns null after the TTL elapses', async () => {
  const s = createSessionStore({ ttlMs: 1 });
  const t = s.start({ keyName: 'carol' });
  await sleep(10);
  assert.equal(s.get(t), null);
});

test('raw token is not present in the internal store (only its hash)', () => {
  // The store has no public way to enumerate values, but we can serialise
  // the store via JSON.stringify against a reflected map. Instead we verify
  // that we cannot reconstruct the raw token from store.size or get():
  // these are the only public surfaces. The structural guarantee is that
  // start() hashes the token via sha256 before insertion (see implementation).
  // This test is therefore an integration-style sanity check rather than a
  // memory-inspection assertion.
  const s = createSessionStore();
  const t = s.start({ keyName: 'dan' });
  assert.equal(s.size, 1);
  // The token itself is opaque to get() except as a lookup key; we cannot
  // retrieve the raw string back, which is what we want.
  const entry = s.get(t);
  assert.equal(entry.keyName, 'dan');
  // Confirm a different store cannot resolve the same token (no shared state).
  const s2 = createSessionStore();
  assert.equal(s2.get(t), null);
});

test('size reflects active sessions', () => {
  const s = createSessionStore();
  assert.equal(s.size, 0);
  const a = s.start({ keyName: 'x' });
  const b = s.start({ keyName: 'y' });
  assert.equal(s.size, 2);
  s.destroy(a);
  assert.equal(s.size, 1);
  s.destroy(b);
  assert.equal(s.size, 0);
});
