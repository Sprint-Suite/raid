// tests/accessKeys.unit.test.js
//
// Tests use a fresh temp keys file per test so they don't share state.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  AccessKeyError,
  createAccessKey,
  hashAccessKey,
  listAccessKeys,
  loadAccessKeys,
  removeAccessKey,
  verifyAccessKey
} = require('../lib/accessKeys.js');

function tempKeysFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-keys-test-'));
  return path.join(dir, 'keys.json');
}

test('createAccessKey: generates a 16-char key and persists hash+salt (never plaintext)', () => {
  const file = tempKeysFile();
  const { name, value } = createAccessKey(file, 'alice');
  assert.equal(name, 'alice');
  assert.equal(value.length, 16);

  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(raw.alice.hash, 'hash missing');
  assert.ok(raw.alice.salt, 'salt missing');
  assert.equal(raw.alice.active, true);
  assert.ok(raw.alice.createdAt);
  assert.equal(raw.alice.value, undefined, 'plaintext value must never be persisted');
  assert.equal(JSON.stringify(raw).includes(value), false, 'plaintext key must not appear in keys.json');
});

test('verifyAccessKey: returns ok+name for the correct value', () => {
  const file = tempKeysFile();
  const { value } = createAccessKey(file, 'bob');
  const result = verifyAccessKey(file, value);
  assert.equal(result.ok, true);
  assert.equal(result.name, 'bob');
});

test('verifyAccessKey: returns ok:false for a wrong value', () => {
  const file = tempKeysFile();
  createAccessKey(file, 'carol');
  const result = verifyAccessKey(file, 'NotTheRealKeyXX');
  assert.equal(result.ok, false);
});

test('verifyAccessKey: returns ok:false for inactive keys', () => {
  const file = tempKeysFile();
  const { value } = createAccessKey(file, 'dave');
  // Manually mark inactive
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  raw.dave.active = false;
  fs.writeFileSync(file, JSON.stringify(raw));

  const result = verifyAccessKey(file, value);
  assert.equal(result.ok, false);
});

test('verifyAccessKey: rejects too-short candidates', () => {
  const file = tempKeysFile();
  const result = verifyAccessKey(file, 'tiny');
  assert.equal(result.ok, false);
});

test('removeAccessKey: removes a named key', () => {
  const file = tempKeysFile();
  createAccessKey(file, 'erin');
  removeAccessKey(file, 'erin');
  const list = listAccessKeys(file);
  assert.equal(list.length, 0);
});

test('removeAccessKey: throws NAME_NOT_FOUND for unknown', () => {
  const file = tempKeysFile();
  assert.throws(() => removeAccessKey(file, 'nope'), (err) => {
    return err instanceof AccessKeyError && err.code === 'NAME_NOT_FOUND';
  });
});

test('listAccessKeys: returns names + active + createdAt, no hash/salt', () => {
  const file = tempKeysFile();
  createAccessKey(file, 'frank');
  const list = listAccessKeys(file);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'frank');
  assert.equal(list[0].active, true);
  assert.ok(list[0].createdAt);
  assert.equal(list[0].hash, undefined);
  assert.equal(list[0].salt, undefined);
});

test('loadAccessKeys: throws KEYS_INVALID for malformed JSON', () => {
  const file = tempKeysFile();
  fs.writeFileSync(file, 'not json');
  assert.throws(() => loadAccessKeys(file), (err) => {
    return err instanceof AccessKeyError && err.code === 'KEYS_INVALID';
  });
});

test('loadAccessKeys: throws KEYS_INVALID for non-object JSON', () => {
  const file = tempKeysFile();
  fs.writeFileSync(file, '[]');
  assert.throws(() => loadAccessKeys(file), (err) => {
    return err instanceof AccessKeyError && err.code === 'KEYS_INVALID';
  });
});

test('createAccessKey: rejects duplicate names', () => {
  const file = tempKeysFile();
  createAccessKey(file, 'gail');
  assert.throws(() => createAccessKey(file, 'gail'), (err) => {
    return err instanceof AccessKeyError && err.code === 'NAME_EXISTS';
  });
});

test('createAccessKey: rejects invalid names', () => {
  const file = tempKeysFile();
  assert.throws(() => createAccessKey(file, ''), (err) => err.code === 'NAME_INVALID');
  assert.throws(() => createAccessKey(file, ' starts-with-space'), (err) => err.code === 'NAME_INVALID');
});

test('hashAccessKey: same salt+value → same hash; different salt → different hash', () => {
  const h1 = hashAccessKey('secret', 'salt1');
  const h2 = hashAccessKey('secret', 'salt1');
  const h3 = hashAccessKey('secret', 'salt2');
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
});

test('createAccessKey: persists expiresAt when supplied', () => {
  const file = tempKeysFile();
  const expiresAt = Date.now() + 86_400_000;
  createAccessKey(file, 'alice', { expiresAt });

  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(raw.alice.expiresAt, expiresAt);
});

test('createAccessKey: omits expiresAt when not supplied', () => {
  const file = tempKeysFile();
  createAccessKey(file, 'alice');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal('expiresAt' in raw.alice, false);
});

test('verifyAccessKey: rejects an expired key as if inactive', () => {
  const file = tempKeysFile();
  const { value } = createAccessKey(file, 'bob', { expiresAt: Date.now() - 1000 });
  const result = verifyAccessKey(file, value);
  assert.equal(result.ok, false);
});

test('verifyAccessKey: accepts a key whose expiresAt is in the future', () => {
  const file = tempKeysFile();
  const { value } = createAccessKey(file, 'carol', { expiresAt: Date.now() + 60_000 });
  const result = verifyAccessKey(file, value);
  assert.equal(result.ok, true);
  assert.equal(result.name, 'carol');
});

test('listAccessKeys: surfaces expiresAt and an expired flag', () => {
  const file = tempKeysFile();
  createAccessKey(file, 'past', { expiresAt: Date.now() - 1 });
  createAccessKey(file, 'future', { expiresAt: Date.now() + 60_000 });
  createAccessKey(file, 'never');

  const list = listAccessKeys(file);
  const byName = Object.fromEntries(list.map(k => [k.name, k]));
  assert.equal(byName.past.expired, true);
  assert.equal(byName.future.expired, false);
  assert.equal(byName.never.expired, false);
  assert.equal(byName.past.expiresAt, byName.past.expiresAt);   // number
  assert.equal(byName.never.expiresAt, null);
});
