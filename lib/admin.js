// lib/admin.js
//
// Operations beyond what lib/accessKeys.js already does:
//   - rotateAccessKey: replace a key's salt+hash, keep its name and expiresAt
//   - setExpiry: write or clear a key's expiresAt
//   - isAdmin: compare a session's keyName to RAID_ADMIN_KEY_NAME

const fs = require('node:fs');
const crypto = require('node:crypto');
const {
  AccessKeyError,
  DEFAULT_GENERATED_LENGTH,
  generateAccessKey,
  hashAccessKey
} = require('./accessKeys.js');

function readRaw(file) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeRaw(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
}

function rotateAccessKey(file, name, { length = DEFAULT_GENERATED_LENGTH } = {}) {
  const raw = readRaw(file);
  if (!Object.prototype.hasOwnProperty.call(raw, name)) {
    throw new AccessKeyError(`No key named "${name}" found.`, 'NAME_NOT_FOUND');
  }
  const value = generateAccessKey(length);
  const salt = crypto.randomBytes(16).toString('hex');
  const prev = raw[name];
  raw[name] = {
    hash: hashAccessKey(value, salt),
    salt,
    active: prev.active !== false,
    createdAt: new Date().toISOString()
  };
  if (typeof prev.expiresAt === 'number') {
    raw[name].expiresAt = prev.expiresAt;
  }
  writeRaw(file, raw);
  return { name, value };
}

function setExpiry(file, name, expiresAt) {
  const raw = readRaw(file);
  if (!Object.prototype.hasOwnProperty.call(raw, name)) {
    throw new AccessKeyError(`No key named "${name}" found.`, 'NAME_NOT_FOUND');
  }
  if (expiresAt === null) {
    delete raw[name].expiresAt;
  } else if (typeof expiresAt === 'number' && Number.isFinite(expiresAt)) {
    raw[name].expiresAt = expiresAt;
  } else {
    throw new AccessKeyError('expiresAt must be a number or null.', 'EXPIRES_INVALID');
  }
  writeRaw(file, raw);
  return { name, expiresAt: raw[name].expiresAt ?? null };
}

function isAdmin(keyName, env = process.env) {
  if (typeof keyName !== 'string' || keyName.length === 0) return false;
  const adminName = env && typeof env.RAID_ADMIN_KEY_NAME === 'string' ? env.RAID_ADMIN_KEY_NAME : '';
  if (!adminName) return false;
  return keyName === adminName;
}

module.exports = { rotateAccessKey, setExpiry, isAdmin };
