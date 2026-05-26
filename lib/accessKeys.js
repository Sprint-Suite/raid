// lib/accessKeys.js
//
// Salted SHA-256 access keys. Adapted from scrumpoker but slimmer:
// no legacy plaintext migration, no room state, no fingerprinting helpers.
//
// Format on disk (keys.json):
// {
//   "name": { "hash": "<sha256hex>", "salt": "<hex>", "active": true, "createdAt": "ISO" }
// }

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ACCESS_KEY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const DEFAULT_GENERATED_LENGTH = 16;
const MIN_ACCESS_KEY_LENGTH = 12;
const ACCESS_KEY_SALT_BYTES = 16;
const KEY_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/;

class AccessKeyError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AccessKeyError';
    this.code = code;
  }
}

function getKeysFilePath(baseDir, env = process.env) {
  return env.RAID_KEYS_FILE
    ? path.resolve(env.RAID_KEYS_FILE)
    : path.join(baseDir, 'keys.json');
}

function generateSalt() {
  return crypto.randomBytes(ACCESS_KEY_SALT_BYTES).toString('hex');
}

// Salted SHA-256. Access keys are high-entropy random tokens — a fast hash
// suffices and a per-key salt blocks rainbow tables. SHA-256 also keeps
// login fast: candidate is checked against every stored key.
function hashAccessKey(value, salt) {
  return crypto.createHash('sha256').update(`${salt}:${value}`).digest('hex');
}

function generateAccessKey(length = DEFAULT_GENERATED_LENGTH) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ACCESS_KEY_CHARS[bytes[i] % ACCESS_KEY_CHARS.length];
  }
  return out;
}

function readKeysFile(file) {
  if (!fs.existsSync(file)) return {};
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new AccessKeyError(`Could not read keys file: ${err.message}`, 'KEYS_READ');
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new AccessKeyError(`Keys file is not valid JSON: ${err.message}`, 'KEYS_INVALID');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AccessKeyError('Keys file must contain a JSON object.', 'KEYS_INVALID');
  }
  return parsed;
}

function writeKeysFile(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
}

function validateRecord(name, record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new AccessKeyError(`Key "${name}" must be an object.`, 'KEYS_INVALID');
  }
  if (typeof record.hash !== 'string' || typeof record.salt !== 'string') {
    throw new AccessKeyError(`Key "${name}" missing hash/salt.`, 'KEYS_INVALID');
  }
  if (typeof record.active !== 'undefined' && typeof record.active !== 'boolean') {
    throw new AccessKeyError(`Key "${name}" active flag must be boolean.`, 'KEYS_INVALID');
  }
}

function loadAccessKeys(file) {
  const raw = readKeysFile(file);
  const out = new Map();
  for (const [name, record] of Object.entries(raw)) {
    validateRecord(name, record);
    out.set(name, {
      hash: record.hash,
      salt: record.salt,
      active: record.active !== false,
      createdAt: typeof record.createdAt === 'string' ? record.createdAt : null
    });
  }
  return out;
}

// Constant-time string comparison so we don't leak which key matched by timing.
function timingSafeEqual(a, b) {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function verifyAccessKey(file, candidate) {
  if (typeof candidate !== 'string' || candidate.length < MIN_ACCESS_KEY_LENGTH) {
    return { ok: false };
  }
  const keys = loadAccessKeys(file);
  for (const [name, record] of keys) {
    if (!record.active) continue;
    const candHash = hashAccessKey(candidate, record.salt);
    if (timingSafeEqual(candHash, record.hash)) {
      return { ok: true, name };
    }
  }
  return { ok: false };
}

function createAccessKey(file, name, { length = DEFAULT_GENERATED_LENGTH } = {}) {
  if (!KEY_NAME_PATTERN.test(name)) {
    throw new AccessKeyError(
      'Key name must start with a letter or digit and may include letters, digits, spaces, periods, underscores, or dashes (1-64 chars).',
      'NAME_INVALID'
    );
  }
  const raw = readKeysFile(file);
  if (Object.prototype.hasOwnProperty.call(raw, name)) {
    throw new AccessKeyError(`A key named "${name}" already exists.`, 'NAME_EXISTS');
  }
  const value = generateAccessKey(length);
  const salt = generateSalt();
  raw[name] = {
    hash: hashAccessKey(value, salt),
    salt,
    active: true,
    createdAt: new Date().toISOString()
  };
  writeKeysFile(file, raw);
  return { name, value };
}

function listAccessKeys(file) {
  const raw = readKeysFile(file);
  return Object.entries(raw).map(([name, record]) => ({
    name,
    active: record.active !== false,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : null
  }));
}

function removeAccessKey(file, name) {
  const raw = readKeysFile(file);
  if (!Object.prototype.hasOwnProperty.call(raw, name)) {
    throw new AccessKeyError(`No key named "${name}" found.`, 'NAME_NOT_FOUND');
  }
  delete raw[name];
  writeKeysFile(file, raw);
  return { name };
}

module.exports = {
  AccessKeyError,
  MIN_ACCESS_KEY_LENGTH,
  DEFAULT_GENERATED_LENGTH,
  getKeysFilePath,
  hashAccessKey,
  generateAccessKey,
  loadAccessKeys,
  verifyAccessKey,
  createAccessKey,
  listAccessKeys,
  removeAccessKey
};
