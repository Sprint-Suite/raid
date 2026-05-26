// lib/session.js
//
// Tiny in-memory session store. Maps SHA-256(token) → { keyName, expiresAt }.
// The raw token never sits in memory — only its hash — so a memory dump
// won't yield valid session tokens.

const crypto = require('node:crypto');

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function createSessionStore({ ttlMs } = {}) {
  const envTtl = Number.parseInt(process.env.RAID_SESSION_TTL_MS, 10);
  const ttl = Number.isFinite(ttlMs) && ttlMs > 0
    ? ttlMs
    : (Number.isFinite(envTtl) && envTtl > 0 ? envTtl : DEFAULT_TTL_MS);

  // Map<sha256hex, { keyName, expiresAt }>
  const store = new Map();

  function purgeExpired(now) {
    for (const [h, entry] of store) {
      if (entry.expiresAt <= now) store.delete(h);
    }
  }

  return {
    start({ keyName }) {
      const raw = generateToken();
      const expiresAt = Date.now() + ttl;
      store.set(hashToken(raw), { keyName, expiresAt });
      return raw;
    },

    get(raw) {
      if (typeof raw !== 'string' || raw.length === 0) return null;
      const h = hashToken(raw);
      const entry = store.get(h);
      if (!entry) return null;
      const now = Date.now();
      if (entry.expiresAt <= now) {
        store.delete(h);
        return null;
      }
      // Opportunistically GC other expired entries on read.
      if (store.size > 64) purgeExpired(now);
      return { keyName: entry.keyName, expiresAt: entry.expiresAt };
    },

    destroy(raw) {
      if (typeof raw !== 'string' || raw.length === 0) return;
      store.delete(hashToken(raw));
    },

    get size() { return store.size; }
  };
}

module.exports = { createSessionStore, DEFAULT_TTL_MS };
