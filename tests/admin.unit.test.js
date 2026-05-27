// tests/admin.unit.test.js

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAccessKey, verifyAccessKey, listAccessKeys, AccessKeyError } = require('../lib/accessKeys.js');
const { rotateAccessKey, setExpiry, isAdmin } = require('../lib/admin.js');

function tempKeysFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-admin-test-'));
  return path.join(dir, 'keys.json');
}

test('rotateAccessKey: new value works, old value fails', () => {
  const file = tempKeysFile();
  const { value: oldValue } = createAccessKey(file, 'alice');
  const { name, value: newValue } = rotateAccessKey(file, 'alice');

  assert.equal(name, 'alice');
  assert.notEqual(oldValue, newValue);
  assert.equal(verifyAccessKey(file, oldValue).ok, false);
  assert.equal(verifyAccessKey(file, newValue).ok, true);
});

test('rotateAccessKey: preserves expiresAt', () => {
  const file = tempKeysFile();
  const expiresAt = Date.now() + 60_000;
  createAccessKey(file, 'alice', { expiresAt });
  rotateAccessKey(file, 'alice');

  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(raw.alice.expiresAt, expiresAt);
});

test('rotateAccessKey: throws AccessKeyError NAME_NOT_FOUND for unknown name', () => {
  const file = tempKeysFile();
  assert.throws(
    () => rotateAccessKey(file, 'ghost'),
    (err) => err instanceof AccessKeyError && err.code === 'NAME_NOT_FOUND'
  );
});

test('setExpiry: writes the timestamp', () => {
  const file = tempKeysFile();
  createAccessKey(file, 'alice');
  const ts = Date.now() + 60_000;
  setExpiry(file, 'alice', ts);

  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(raw.alice.expiresAt, ts);
});

test('setExpiry: null clears the timestamp', () => {
  const file = tempKeysFile();
  createAccessKey(file, 'alice', { expiresAt: Date.now() + 60_000 });
  setExpiry(file, 'alice', null);

  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal('expiresAt' in raw.alice, false);
});

test('setExpiry: throws NAME_NOT_FOUND for unknown name', () => {
  const file = tempKeysFile();
  assert.throws(
    () => setExpiry(file, 'ghost', Date.now() + 1000),
    (err) => err instanceof AccessKeyError && err.code === 'NAME_NOT_FOUND'
  );
});

test('isAdmin: matches RAID_ADMIN_KEY_NAME exactly', () => {
  assert.equal(isAdmin('david', { RAID_ADMIN_KEY_NAME: 'david' }), true);
  assert.equal(isAdmin('david', { RAID_ADMIN_KEY_NAME: 'David' }), false);
  assert.equal(isAdmin('david', { RAID_ADMIN_KEY_NAME: '' }), false);
  assert.equal(isAdmin('david', {}), false);
  assert.equal(isAdmin(null, { RAID_ADMIN_KEY_NAME: 'david' }), false);
});
