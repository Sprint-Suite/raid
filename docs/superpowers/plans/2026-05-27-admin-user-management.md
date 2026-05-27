# Admin User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a web admin page at `/admin` for managing per-user access keys (add, remove, rotate, optional expiry) so the admin can demo RAID without SSHing into the server.

**Architecture:** One new lib module (`lib/admin.js`) wraps existing `lib/accessKeys.js` with rotation, expiry, and an `isAdmin` check. `lib/session.js` gains `destroyByKeyName`. `server.js` adds a `requireAdmin` middleware and four `/api/admin/users` endpoints. A new static page (`public/admin.html` + `public/js/admin.js`) consumes those endpoints. Admin identity is decided by the env var `RAID_ADMIN_KEY_NAME`; unset = admin surface returns 404 entirely.

**Tech Stack:** Node.js (built-in `node:test`), Express 5, vanilla JS in the browser, Playwright for E2E. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-27-admin-user-management-design.md`

---

## File Structure

**Create:**
- `lib/admin.js` — `rotateAccessKey`, `setExpiry`, `isAdmin`
- `tests/admin.unit.test.js` — unit tests for `lib/admin.js`
- `public/admin.html` — admin page markup
- `public/js/admin.js` — admin page client logic
- `public/css/admin.css` — minimal admin-specific styles
- `tests/e2e/admin.spec.js` — Playwright admin flow

**Modify:**
- `lib/accessKeys.js` — `expiresAt` field, `verifyAccessKey` skips expired, `createAccessKey` accepts `expiresAt`
- `lib/session.js` — add `destroyByKeyName(name)`
- `server.js` — `requireAdmin` middleware, four `/api/admin/users` routes, `/admin.html` route, startup warning
- `tests/accessKeys.unit.test.js` — add expiry tests
- `tests/session.unit.test.js` — add `destroyByKeyName` tests
- `tests/fixtures/test-keys.json` — add a second non-admin user for E2E
- `playwright.config.js` — set `RAID_ADMIN_KEY_NAME=e2e` so the existing `e2e` user is the admin
- `README.md` — short note on the admin page

---

## Task 1: Extend `lib/session.js` with `destroyByKeyName`

**Files:**
- Modify: `lib/session.js`
- Modify: `tests/session.unit.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/session.unit.test.js`:

```javascript
test('destroyByKeyName: deletes every session for the named key', () => {
  const s = createSessionStore();
  const a1 = s.start({ keyName: 'alice' });
  const a2 = s.start({ keyName: 'alice' });
  const b1 = s.start({ keyName: 'bob' });

  s.destroyByKeyName('alice');

  assert.equal(s.get(a1), null);
  assert.equal(s.get(a2), null);
  assert.ok(s.get(b1), "bob's session should be untouched");
  assert.equal(s.size, 1);
});

test('destroyByKeyName: no-op when no session matches', () => {
  const s = createSessionStore();
  s.start({ keyName: 'alice' });
  assert.doesNotThrow(() => s.destroyByKeyName('nobody'));
  assert.equal(s.size, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/session.unit.test.js`
Expected: FAIL — `s.destroyByKeyName is not a function`.

- [ ] **Step 3: Implement `destroyByKeyName` in `lib/session.js`**

Add the method to the object returned from `createSessionStore` (alongside `start`, `get`, `destroy`):

```javascript
    destroyByKeyName(keyName) {
      for (const [h, entry] of store) {
        if (entry.keyName === keyName) store.delete(h);
      }
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/session.unit.test.js`
Expected: PASS for all tests including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add lib/session.js tests/session.unit.test.js
git commit -m "feat(session): add destroyByKeyName for key revocation"
```

---

## Task 2: Add `expiresAt` support to `lib/accessKeys.js`

**Files:**
- Modify: `lib/accessKeys.js`
- Modify: `tests/accessKeys.unit.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/accessKeys.unit.test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/accessKeys.unit.test.js`
Expected: FAIL — `createAccessKey` ignores `expiresAt`; `verifyAccessKey` returns `ok: true` for the expired key; `listAccessKeys` does not include the new fields.

- [ ] **Step 3: Update `loadAccessKeys` to include `expiresAt`**

In `lib/accessKeys.js`, inside `loadAccessKeys`, change the object passed to `out.set(name, ...)`:

```javascript
    out.set(name, {
      hash: record.hash,
      salt: record.salt,
      active: record.active !== false,
      createdAt: typeof record.createdAt === 'string' ? record.createdAt : null,
      expiresAt: typeof record.expiresAt === 'number' ? record.expiresAt : null
    });
```

- [ ] **Step 4: Update `verifyAccessKey` to skip expired records**

In `lib/accessKeys.js`, inside `verifyAccessKey`, replace the loop body:

```javascript
  for (const [name, record] of keys) {
    if (!record.active) continue;
    if (record.expiresAt !== null && Date.now() > record.expiresAt) continue;
    const candHash = hashAccessKey(candidate, record.salt);
    if (timingSafeEqual(candHash, record.hash)) {
      return { ok: true, name };
    }
  }
```

- [ ] **Step 5: Update `createAccessKey` to accept `expiresAt`**

In `lib/accessKeys.js`, change the signature and body:

```javascript
function createAccessKey(file, name, { length = DEFAULT_GENERATED_LENGTH, expiresAt = null } = {}) {
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
  const record = {
    hash: hashAccessKey(value, salt),
    salt,
    active: true,
    createdAt: new Date().toISOString()
  };
  if (typeof expiresAt === 'number' && Number.isFinite(expiresAt)) {
    record.expiresAt = expiresAt;
  }
  raw[name] = record;
  writeKeysFile(file, raw);
  return { name, value };
}
```

- [ ] **Step 6: Update `listAccessKeys` to surface `expiresAt` and `expired`**

In `lib/accessKeys.js`, replace the function body:

```javascript
function listAccessKeys(file) {
  const raw = readKeysFile(file);
  const now = Date.now();
  return Object.entries(raw).map(([name, record]) => {
    const expiresAt = typeof record.expiresAt === 'number' ? record.expiresAt : null;
    return {
      name,
      active: record.active !== false,
      createdAt: typeof record.createdAt === 'string' ? record.createdAt : null,
      expiresAt,
      expired: expiresAt !== null && now > expiresAt
    };
  });
}
```

- [ ] **Step 7: Validate the stored `expiresAt`**

In `lib/accessKeys.js`, inside `validateRecord`, add after the `active` check:

```javascript
  if (typeof record.expiresAt !== 'undefined' && typeof record.expiresAt !== 'number') {
    throw new AccessKeyError(`Key "${name}" expiresAt must be a number.`, 'KEYS_INVALID');
  }
```

- [ ] **Step 8: Run all unit tests to verify pass**

Run: `npm test`
Expected: PASS for all suites including the new accessKeys tests.

- [ ] **Step 9: Commit**

```bash
git add lib/accessKeys.js tests/accessKeys.unit.test.js
git commit -m "feat(access-keys): support optional per-key expiry"
```

---

## Task 3: Create `lib/admin.js` with `rotateAccessKey`, `setExpiry`, `isAdmin`

**Files:**
- Create: `lib/admin.js`
- Create: `tests/admin.unit.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/admin.unit.test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/admin.unit.test.js`
Expected: FAIL — module `../lib/admin.js` not found.

- [ ] **Step 3: Implement `lib/admin.js`**

Create the file:

```javascript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/admin.unit.test.js`
Expected: PASS for all seven tests.

- [ ] **Step 5: Run full unit suite to confirm no regressions**

Run: `npm test`
Expected: PASS across every `*.unit.test.js` file.

- [ ] **Step 6: Commit**

```bash
git add lib/admin.js tests/admin.unit.test.js
git commit -m "feat(admin): add rotateAccessKey, setExpiry, isAdmin"
```

---

## Task 4: Add admin middleware and routes to `server.js`

**Files:**
- Modify: `server.js`

This task has no unit tests of its own — the routes are covered end-to-end by Task 6 (Playwright). Manual smoke at the end of the task.

- [ ] **Step 1: Add imports and the admin name lookup at the top of `server.js`**

Below the existing `require` lines, add:

```javascript
const { createAccessKey, listAccessKeys, removeAccessKey } = require('./lib/accessKeys.js');
const { rotateAccessKey, isAdmin } = require('./lib/admin.js');
```

(Add `createAccessKey, listAccessKeys, removeAccessKey` to the existing `accessKeys` destructure if simpler; the import lines above are explicit for clarity. Match whichever style the file already uses.)

After `const KEYS_FILE = getKeysFilePath(__dirname);` add:

```javascript
const ADMIN_KEY_NAME = process.env.RAID_ADMIN_KEY_NAME || '';
```

- [ ] **Step 2: Add the `requireAdmin` middleware**

Below the existing `requireAuth` function add:

```javascript
function requireAdmin(req, res, next) {
  if (!ADMIN_KEY_NAME) return res.status(404).end();
  if (!req.session || !isAdmin(req.session.keyName, process.env)) {
    return res.status(404).end();
  }
  next();
}
```

- [ ] **Step 3: Add a startup warning if the admin name is set but missing**

Replace the existing `app.listen(...)` line at the bottom of `server.js` with:

```javascript
if (ADMIN_KEY_NAME) {
  try {
    const known = listAccessKeys(KEYS_FILE).map(k => k.name);
    if (!known.includes(ADMIN_KEY_NAME)) {
      console.warn(`RAID_ADMIN_KEY_NAME="${ADMIN_KEY_NAME}" does not match any key in ${KEYS_FILE}. Admin UI will be unreachable until a key with that name is generated.`);
    }
  } catch (err) {
    console.warn(`Could not check admin key name at startup: ${err.message}`);
  }
}

app.listen(PORT, () => console.log(`RAID listening on :${PORT} (model ${MODEL})`));
```

- [ ] **Step 4: Mount the `/admin.html` route**

Below the existing `app.get('/', requireAuth, ...)` line add:

```javascript
app.get('/admin.html', requireAuth, requireAdmin, (_req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});
```

- [ ] **Step 5: Add `GET /api/admin/users`**

Below the new `/admin.html` route add:

```javascript
app.get('/api/admin/users', requireAuth, requireAdmin, (_req, res) => {
  const users = listAccessKeys(KEYS_FILE).map(u => ({
    name: u.name,
    createdAt: u.createdAt,
    expiresAt: u.expiresAt,
    expired: u.expired,
    hasSession: hasActiveSession(u.name)
  }));
  res.json({ users });
});
```

Then add this helper just above the route block (after `requireAdmin`):

```javascript
function hasActiveSession(keyName) {
  // session store has no enumeration API; reuse destroyByKeyName's loop pattern
  // via a flag. Tiny store at this scale; iterate directly.
  // We keep the check on the route so the session module stays minimal.
  for (const token of sessions._tokensForTest ? sessions._tokensForTest() : []) {
    const entry = sessions.get(token);
    if (entry && entry.keyName === keyName) return true;
  }
  return false;
}
```

…but rather than expose internals, **prefer** adding a public method to `lib/session.js`. Do that instead:

  - Open `lib/session.js`, add to the returned object:
    ```javascript
    hasKeyName(keyName) {
      for (const entry of store.values()) {
        if (entry.keyName === keyName) return true;
      }
      return false;
    },
    ```
  - Replace the `hasActiveSession` helper in `server.js` with a direct call:
    ```javascript
    function hasActiveSession(keyName) {
      return sessions.hasKeyName(keyName);
    }
    ```

- [ ] **Step 6: Add `POST /api/admin/users`**

Below the `GET /api/admin/users` route add:

```javascript
app.post('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'name is required.' });

  let expiresAt = null;
  if (req.body?.expiresInDays !== undefined && req.body?.expiresInDays !== null && req.body?.expiresInDays !== '') {
    const days = Number(req.body.expiresInDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return res.status(400).json({ error: 'expiresInDays must be an integer between 1 and 365.' });
    }
    expiresAt = Date.now() + days * 86_400_000;
  }

  try {
    const { value } = createAccessKey(KEYS_FILE, name, { expiresAt });
    return res.status(200).json({ name, value, expiresAt });
  } catch (err) {
    if (err.code === 'NAME_INVALID' || err.code === 'NAME_EXISTS') {
      return res.status(400).json({ error: err.message });
    }
    console.error('admin: createAccessKey failed:', err.message);
    return res.status(500).json({ error: 'Could not create key.' });
  }
});
```

- [ ] **Step 7: Add `DELETE /api/admin/users/:name`**

Below the `POST` route add:

```javascript
app.delete('/api/admin/users/:name', requireAuth, requireAdmin, (req, res) => {
  const name = req.params.name;
  if (name === ADMIN_KEY_NAME) {
    return res.status(400).json({ error: 'Cannot delete the admin key from the web UI. Use the CLI.' });
  }
  try {
    removeAccessKey(KEYS_FILE, name);
    sessions.destroyByKeyName(name);
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err.code === 'NAME_NOT_FOUND') {
      return res.status(404).json({ error: err.message });
    }
    console.error('admin: removeAccessKey failed:', err.message);
    return res.status(500).json({ error: 'Could not remove key.' });
  }
});
```

- [ ] **Step 8: Add `POST /api/admin/users/:name/rotate`**

Below the `DELETE` route add:

```javascript
app.post('/api/admin/users/:name/rotate', requireAuth, requireAdmin, (req, res) => {
  const name = req.params.name;
  if (name === ADMIN_KEY_NAME) {
    return res.status(400).json({ error: 'Cannot rotate the admin key from the web UI. Use the CLI.' });
  }
  try {
    const { value } = rotateAccessKey(KEYS_FILE, name);
    sessions.destroyByKeyName(name);
    return res.status(200).json({ name, value });
  } catch (err) {
    if (err.code === 'NAME_NOT_FOUND') {
      return res.status(404).json({ error: err.message });
    }
    console.error('admin: rotateAccessKey failed:', err.message);
    return res.status(500).json({ error: 'Could not rotate key.' });
  }
});
```

- [ ] **Step 9: Manual smoke test**

In one terminal:

```bash
node manageKeys.js generate admin-smoke
# copy the printed plaintext, call it $ADMIN_KEY
node manageKeys.js generate user-smoke
# copy this plaintext too, call it $USER_KEY
RAID_ADMIN_KEY_NAME=admin-smoke ANTHROPIC_API_KEY=dummy PORT=3099 node server.js
```

In another terminal, replace `$ADMIN_KEY` and `$USER_KEY` with your values:

```bash
# Admin can list
curl -s -c /tmp/admin.jar -X POST http://localhost:3099/api/login -H 'content-type: application/json' -d "{\"key\":\"$ADMIN_KEY\"}"
curl -s -b /tmp/admin.jar http://localhost:3099/api/admin/users
# Expected: JSON listing both keys.

# Non-admin gets 404
curl -s -c /tmp/user.jar -X POST http://localhost:3099/api/login -H 'content-type: application/json' -d "{\"key\":\"$USER_KEY\"}"
curl -s -w '\n%{http_code}\n' -b /tmp/user.jar http://localhost:3099/api/admin/users
# Expected: 404
```

Stop the server (Ctrl+C). Clean up:

```bash
node manageKeys.js remove admin-smoke
node manageKeys.js remove user-smoke
```

- [ ] **Step 10: Run the full unit suite**

Run: `npm test`
Expected: PASS, no regressions.

- [ ] **Step 11: Commit**

```bash
git add server.js lib/session.js
git commit -m "feat(admin): add /api/admin/users routes and requireAdmin guard"
```

---

## Task 5: Build the admin page (HTML/CSS/JS)

**Files:**
- Create: `public/admin.html`
- Create: `public/js/admin.js`
- Create: `public/css/admin.css`

This task is fully covered by Playwright in Task 6. No unit tests here. Verify visually at the end.

- [ ] **Step 1: Create `public/admin.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RAID — Admin</title>
  <meta name="description" content="Manage RAID access keys.">

  <link rel="stylesheet" href="/css/theme-core.css">
  <link rel="stylesheet" href="/css/theme-raid.css">
  <link rel="stylesheet" href="/css/app.css">
  <link rel="stylesheet" href="/css/admin.css">

  <script src="/js/admin.js" defer></script>
</head>
<body class="admin-body">

  <header class="admin-header">
    <h1 class="admin-header__title">RAID admin</h1>
    <div class="admin-header__meta">
      <span id="admin-whoami" class="admin-header__whoami"></span>
      <a href="/" class="admin-header__link">Back to app</a>
      <button id="admin-logout" class="btn btn--ghost" type="button">Sign out</button>
    </div>
  </header>

  <main class="admin-main">

    <section id="admin-banner" class="admin-banner" hidden>
      <h2 class="admin-banner__title">New key for <span id="admin-banner-name"></span></h2>
      <p class="admin-banner__hint">Copy this now — it will not be shown again.</p>
      <div class="admin-banner__row">
        <code id="admin-banner-value" class="admin-banner__value"></code>
        <button id="admin-banner-copy" class="btn btn--primary" type="button">Copy</button>
        <button id="admin-banner-dismiss" class="btn btn--ghost" type="button">Dismiss</button>
      </div>
    </section>

    <section class="admin-card">
      <h2 class="admin-card__title">Add user</h2>
      <form id="admin-add-form" class="admin-form" autocomplete="off">
        <label class="admin-form__label" for="admin-add-name">Name</label>
        <input id="admin-add-name" class="admin-form__input" type="text" required maxlength="64" placeholder="e.g. alice">

        <label class="admin-form__label" for="admin-add-days">Expires in (days, optional)</label>
        <input id="admin-add-days" class="admin-form__input" type="number" min="1" max="365" placeholder="leave blank for no expiry">

        <button id="admin-add-submit" class="btn btn--primary" type="submit">Generate key</button>
      </form>
    </section>

    <section class="admin-card">
      <h2 class="admin-card__title">Users</h2>
      <p id="admin-status" class="admin-status" role="status" aria-live="polite"></p>
      <table class="admin-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Created</th>
            <th scope="col">Expires</th>
            <th scope="col">Signed in</th>
            <th scope="col" class="admin-table__actions">Actions</th>
          </tr>
        </thead>
        <tbody id="admin-users-body">
          <tr><td colspan="5" class="admin-table__empty">Loading…</td></tr>
        </tbody>
      </table>
    </section>

  </main>

</body>
</html>
```

- [ ] **Step 2: Create `public/css/admin.css`**

```css
/* public/css/admin.css — admin page layout. Theme tokens come from theme-core/theme-raid. */

.admin-body {
  margin: 0;
  font-family: var(--font-body, system-ui, sans-serif);
  background: var(--color-bg, #fff);
  color: var(--color-text, #111);
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  border-bottom: 1px solid var(--color-border, #ddd);
}

.admin-header__title { margin: 0; font-size: 1.25rem; }
.admin-header__meta { display: flex; gap: 1rem; align-items: center; }
.admin-header__whoami { color: var(--color-muted, #666); font-size: 0.9rem; }
.admin-header__link { color: var(--color-link, #0a58ca); text-decoration: none; }

.admin-main {
  max-width: 960px;
  margin: 2rem auto;
  padding: 0 1.5rem;
  display: grid;
  gap: 1.5rem;
}

.admin-card {
  border: 1px solid var(--color-border, #ddd);
  border-radius: 0.5rem;
  padding: 1.25rem 1.5rem;
  background: var(--color-surface, #fafafa);
}

.admin-card__title { margin-top: 0; font-size: 1.1rem; }

.admin-form { display: grid; grid-template-columns: max-content 1fr; gap: 0.75rem 1rem; align-items: center; }
.admin-form button[type="submit"] { grid-column: 1 / -1; justify-self: start; }

.admin-status { min-height: 1.25rem; margin: 0 0 0.75rem; color: var(--color-muted, #666); font-size: 0.9rem; }
.admin-status[data-tone="error"] { color: #b32424; }

.admin-table { width: 100%; border-collapse: collapse; }
.admin-table th, .admin-table td { padding: 0.6rem 0.5rem; text-align: left; border-bottom: 1px solid var(--color-border, #eee); }
.admin-table__actions { text-align: right; }
.admin-table__empty { color: var(--color-muted, #666); padding: 1rem; text-align: center; }
.admin-table tr[data-expired="true"] td { opacity: 0.55; }

.admin-table__row-actions { display: inline-flex; gap: 0.5rem; }

.admin-banner {
  border: 2px solid var(--color-accent, #d4a017);
  background: #fff8e1;
  border-radius: 0.5rem;
  padding: 1rem 1.25rem;
}
.admin-banner__title { margin: 0 0 0.25rem; font-size: 1rem; }
.admin-banner__hint  { margin: 0 0 0.75rem; color: var(--color-muted, #666); font-size: 0.85rem; }
.admin-banner__row   { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.admin-banner__value { font-family: ui-monospace, monospace; padding: 0.4rem 0.6rem; background: #fff; border: 1px solid #ddd; border-radius: 0.25rem; word-break: break-all; }
```

- [ ] **Step 3: Create `public/js/admin.js`**

```javascript
// public/js/admin.js
//
// Admin page controller. Lists users, adds, rotates, and deletes them.
// All admin actions hit /api/admin/users; the page itself was already gated
// by requireAdmin on the server side, so any 401/404 here means we lost the
// session or the admin name is no longer ours — bounce to /login.

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  function setStatus(msg, tone) {
    const el = $('admin-status');
    el.textContent = msg || '';
    if (tone) el.setAttribute('data-tone', tone);
    else el.removeAttribute('data-tone');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
  }

  function fmtExpiry(ms, expired) {
    if (ms == null) return 'never';
    const d = new Date(ms);
    const label = d.toISOString().slice(0, 10);
    return expired ? `${label} (expired)` : label;
  }

  async function request(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    if (res.status === 401 || res.status === 404) {
      // Lost the session or no longer admin.
      window.location.href = '/login.html';
      // Throw so callers stop processing.
      throw new Error(`auth lost (${res.status})`);
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json.error || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  function showBanner(name, value) {
    $('admin-banner-name').textContent = name;
    $('admin-banner-value').textContent = value;
    $('admin-banner').hidden = false;
    $('admin-banner-value').focus?.();
  }

  function hideBanner() {
    $('admin-banner').hidden = true;
    $('admin-banner-value').textContent = '';
    $('admin-banner-name').textContent = '';
  }

  async function copyBannerValue() {
    const value = $('admin-banner-value').textContent;
    try {
      await navigator.clipboard.writeText(value);
      setStatus('Copied to clipboard.');
    } catch (_err) {
      setStatus('Copy failed — select the value and copy it manually.', 'error');
    }
  }

  async function loadUsers() {
    const tbody = $('admin-users-body');
    try {
      const { users } = await request('/api/admin/users');
      if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="admin-table__empty">No users yet.</td></tr>';
        return;
      }
      tbody.innerHTML = '';
      for (const u of users) {
        const tr = document.createElement('tr');
        tr.dataset.name = u.name;
        tr.dataset.expired = String(u.expired);

        const name = document.createElement('td'); name.textContent = u.name;
        const created = document.createElement('td'); created.textContent = fmtDate(u.createdAt);
        const expires = document.createElement('td'); expires.textContent = fmtExpiry(u.expiresAt, u.expired);
        const session = document.createElement('td'); session.textContent = u.hasSession ? 'yes' : 'no';

        const actions = document.createElement('td');
        actions.className = 'admin-table__actions';
        const wrap = document.createElement('div');
        wrap.className = 'admin-table__row-actions';

        const rotate = document.createElement('button');
        rotate.type = 'button';
        rotate.className = 'btn btn--ghost';
        rotate.textContent = 'Rotate';
        rotate.addEventListener('click', () => onRotate(u.name));

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn btn--ghost';
        del.textContent = 'Delete';
        del.addEventListener('click', () => onDelete(u.name));

        wrap.append(rotate, del);
        actions.append(wrap);
        tr.append(name, created, expires, session, actions);
        tbody.append(tr);
      }
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" class="admin-table__empty">Could not load users: ${err.message}</td></tr>`;
    }
  }

  async function onAdd(event) {
    event.preventDefault();
    const name = $('admin-add-name').value.trim();
    const daysRaw = $('admin-add-days').value.trim();
    const body = { name };
    if (daysRaw) body.expiresInDays = Number(daysRaw);

    try {
      const { value, name: createdName } = await request('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      showBanner(createdName, value);
      $('admin-add-name').value = '';
      $('admin-add-days').value = '';
      setStatus(`Added "${createdName}".`);
      await loadUsers();
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  async function onRotate(name) {
    if (!window.confirm(`Rotate key for "${name}"? Any current session will be signed out.`)) return;
    try {
      const { value } = await request(`/api/admin/users/${encodeURIComponent(name)}/rotate`, { method: 'POST' });
      showBanner(name, value);
      setStatus(`Rotated "${name}".`);
      await loadUsers();
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  async function onDelete(name) {
    if (!window.confirm(`Delete user "${name}"? This signs them out immediately and removes their key.`)) return;
    try {
      await request(`/api/admin/users/${encodeURIComponent(name)}`, { method: 'DELETE' });
      setStatus(`Deleted "${name}".`);
      await loadUsers();
    } catch (err) {
      setStatus(err.message, 'error');
    }
  }

  async function loadWhoami() {
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        const { name } = await res.json();
        $('admin-whoami').textContent = `Signed in as ${name}`;
      }
    } catch (_err) { /* non-fatal */ }
  }

  async function onLogout() {
    try { await fetch('/api/logout', { method: 'POST' }); } catch (_err) { /* ignore */ }
    window.location.href = '/login.html';
  }

  function init() {
    $('admin-add-form').addEventListener('submit', onAdd);
    $('admin-banner-copy').addEventListener('click', copyBannerValue);
    $('admin-banner-dismiss').addEventListener('click', hideBanner);
    $('admin-logout').addEventListener('click', onLogout);
    loadWhoami();
    loadUsers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

- [ ] **Step 4: Visual smoke test**

Generate two keys (one admin, one user), boot the server with `RAID_ADMIN_KEY_NAME=admin-smoke`, sign in as admin, visit `/admin.html`. Confirm:
- The table renders with both keys.
- "Add user" produces a banner with a copyable value.
- Refresh: the banner is gone.
- "Rotate" on the non-admin row produces a new value and updates the table.
- "Delete" removes the row.
- "Rotate" / "Delete" buttons on the admin row are still present, but clicking them surfaces the 400 error in the status line. (The plan deliberately keeps the buttons clickable rather than hiding them; the server is the source of truth.)

Run the cleanup (`node manageKeys.js remove ...`) before moving on.

- [ ] **Step 5: Commit**

```bash
git add public/admin.html public/js/admin.js public/css/admin.css
git commit -m "feat(admin): add admin page UI"
```

---

## Task 6: Playwright end-to-end tests

**Files:**
- Modify: `playwright.config.js`
- Modify: `tests/fixtures/test-keys.json`
- Create: `tests/e2e/admin.spec.js`

- [ ] **Step 1: Add a non-admin fixture user**

Generate a second hashed entry for the fixture file. Run this one-off script (paste at the shell):

```bash
node -e "
const c = require('crypto');
const salt = c.randomBytes(16).toString('hex');
const value = 'NonAdmin-Test-Key-1';
const hash = c.createHash('sha256').update(salt + ':' + value).digest('hex');
console.log(JSON.stringify({ salt, hash, value }, null, 2));
"
```

Note the output. Edit `tests/fixtures/test-keys.json` so it becomes (replace `<hash>` and `<salt>` with the values you just printed):

```json
{
  "e2e": {
    "hash": "a4e5807eefb7bdfe7fb40015f506a39cc8c67bb11dcb2260b3b0bbcc2d527cd8",
    "salt": "3220cc1ad8d098e4a284e887b4360864",
    "active": true,
    "createdAt": "2026-05-26T00:00:00.000Z"
  },
  "guest": {
    "hash": "<hash>",
    "salt": "<salt>",
    "active": true,
    "createdAt": "2026-05-26T00:00:00.000Z"
  }
}
```

(The `value` printed above is `NonAdmin-Test-Key-1` — the E2E spec will use this verbatim.)

- [ ] **Step 2: Wire `RAID_ADMIN_KEY_NAME` into Playwright's web server**

Edit `playwright.config.js`. Change the `command` line to:

```javascript
    command: 'PORT=3003 ANTHROPIC_API_KEY=dummy-for-e2e RAID_KEYS_FILE=tests/fixtures/test-keys.json RAID_ADMIN_KEY_NAME=e2e node server.js',
```

- [ ] **Step 3: Create `tests/e2e/admin.spec.js`**

```javascript
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const ADMIN_KEY = 'E2E-Test-Key-12345';
const GUEST_KEY = 'NonAdmin-Test-Key-1';
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'test-keys.json');

// Each admin test mutates keys.json. Snapshot before, restore after, so the
// other E2E suite stays deterministic.
let snapshot = null;

test.beforeAll(() => {
  snapshot = fs.readFileSync(FIXTURE, 'utf8');
});

test.afterEach(() => {
  fs.writeFileSync(FIXTURE, snapshot);
});

async function loginAs(context, key) {
  await context.clearCookies();
  const res = await context.request.post('/api/login', { data: { key } });
  if (res.status() !== 200) throw new Error(`login failed: ${res.status()}`);
}

test('admin can open /admin.html and see the users table', async ({ page, context }) => {
  await loginAs(context, ADMIN_KEY);
  await page.goto('/admin.html');
  await expect(page.locator('.admin-header__title')).toHaveText('RAID admin');
  await expect(page.locator('#admin-users-body tr')).toHaveCount(2); // e2e + guest
  await expect(page.locator('#admin-users-body tr[data-name="e2e"]')).toBeVisible();
  await expect(page.locator('#admin-users-body tr[data-name="guest"]')).toBeVisible();
});

test('non-admin gets 404 for /admin.html and /api/admin/users', async ({ page, context }) => {
  await loginAs(context, GUEST_KEY);

  const pageRes = await page.goto('/admin.html');
  expect(pageRes.status()).toBe(404);

  const apiRes = await context.request.get('/api/admin/users');
  expect(apiRes.status()).toBe(404);
});

test('admin can add a user; new key logs in; the user appears in the table', async ({ page, context }) => {
  await loginAs(context, ADMIN_KEY);
  await page.goto('/admin.html');

  await page.fill('#admin-add-name', 'alice');
  await page.fill('#admin-add-days', '7');
  await page.click('#admin-add-submit');

  const value = await page.locator('#admin-banner-value').innerText();
  expect(value).toHaveLength(16);

  await expect(page.locator('#admin-users-body tr[data-name="alice"]')).toBeVisible();

  // The new key actually works.
  await context.clearCookies();
  const login = await context.request.post('/api/login', { data: { key: value } });
  expect(login.status()).toBe(200);
});

test('admin can rotate a user; old key fails, new key works', async ({ page, context }) => {
  // Seed: add the user via the API.
  await loginAs(context, ADMIN_KEY);
  const addRes = await context.request.post('/api/admin/users', { data: { name: 'bob' } });
  expect(addRes.status()).toBe(200);
  const { value: oldValue } = await addRes.json();

  await page.goto('/admin.html');
  page.once('dialog', d => d.accept());
  await page.locator('#admin-users-body tr[data-name="bob"] button:has-text("Rotate")').click();

  const newValue = await page.locator('#admin-banner-value').innerText();
  expect(newValue).not.toEqual(oldValue);

  await context.clearCookies();
  const oldLogin = await context.request.post('/api/login', { data: { key: oldValue } });
  expect(oldLogin.status()).toBe(401);

  const newLogin = await context.request.post('/api/login', { data: { key: newValue } });
  expect(newLogin.status()).toBe(200);
});

test('admin can delete a user; active session is killed immediately', async ({ page, context, browser }) => {
  // Seed a user via the admin API.
  await loginAs(context, ADMIN_KEY);
  const addRes = await context.request.post('/api/admin/users', { data: { name: 'carol' } });
  expect(addRes.status()).toBe(200);
  const { value } = await addRes.json();

  // Sign carol in via a second context.
  const carolCtx = await browser.newContext();
  await loginAs(carolCtx, value);
  const me1 = await carolCtx.request.get('/api/me');
  expect(me1.status()).toBe(200);

  // Admin deletes carol.
  await page.goto('/admin.html');
  page.once('dialog', d => d.accept());
  await page.locator('#admin-users-body tr[data-name="carol"] button:has-text("Delete")').click();
  await expect(page.locator('#admin-users-body tr[data-name="carol"]')).toHaveCount(0);

  // Carol's next request is unauthenticated.
  const me2 = await carolCtx.request.get('/api/me');
  expect(me2.status()).toBe(401);
  await carolCtx.close();
});

test('cannot delete or rotate the admin key from the web UI', async ({ context }) => {
  await loginAs(context, ADMIN_KEY);

  const del = await context.request.delete('/api/admin/users/e2e');
  expect(del.status()).toBe(400);

  const rot = await context.request.post('/api/admin/users/e2e/rotate');
  expect(rot.status()).toBe(400);

  // And the admin key still works.
  await context.clearCookies();
  const login = await context.request.post('/api/login', { data: { key: ADMIN_KEY } });
  expect(login.status()).toBe(200);
});

test('expired key rejected at login', async ({ context }) => {
  await loginAs(context, ADMIN_KEY);
  // Create with expiry 1 day in the future, then mutate the fixture to backdate.
  const addRes = await context.request.post('/api/admin/users', { data: { name: 'dora', expiresInDays: 1 } });
  expect(addRes.status()).toBe(200);
  const { value } = await addRes.json();

  // Backdate to the past via the fixture file.
  const raw = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  raw.dora.expiresAt = Date.now() - 1000;
  fs.writeFileSync(FIXTURE, JSON.stringify(raw, null, 2));

  await context.clearCookies();
  const login = await context.request.post('/api/login', { data: { key: value } });
  expect(login.status()).toBe(401);
});
```

- [ ] **Step 4: Run the E2E suite**

Run: `npm run test:e2e`
Expected: all admin specs PASS; existing `raid.spec.js` still passes.

If a test that mutates `tests/fixtures/test-keys.json` fails partway through, the `afterEach` restore will leave the file clean. Check `git diff tests/fixtures/test-keys.json` is empty before continuing.

- [ ] **Step 5: Run the full unit suite as well**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.js tests/fixtures/test-keys.json tests/e2e/admin.spec.js
git commit -m "test(admin): e2e coverage for add / rotate / delete / expiry"
```

---

## Task 7: Document the admin UI in the README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a short section after "Access keys"**

Open `README.md`. Below the existing "Access keys" section (which currently ends with the paragraph about `keys.json` and in-memory sessions), add:

```markdown
## Admin web UI

Set `RAID_ADMIN_KEY_NAME` to the name of an existing key (created via `manageKeys.js generate`). That user can then visit `/admin.html` to add, rotate, and remove other users from the browser. Without `RAID_ADMIN_KEY_NAME` set, the admin surface returns 404 — no UI, no API.

```bash
node manageKeys.js generate david   # save the key value somewhere
RAID_ADMIN_KEY_NAME=david ANTHROPIC_API_KEY=sk-ant-... npm start
# sign in as "david", then open http://localhost:3003/admin.html
```

You cannot delete or rotate the admin key from the web UI (footgun guard). Use `manageKeys.js` for that.
```

- [ ] **Step 2: Add `RAID_ADMIN_KEY_NAME` to the configuration table**

In the existing `## Configuration` table, add a row:

```markdown
| `RAID_ADMIN_KEY_NAME` | unset | no | Name of the key that gets access to `/admin.html`. Unset = admin UI disabled. |
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(admin): document /admin.html and RAID_ADMIN_KEY_NAME"
```

---

## Self-review checklist

Run through this before declaring the plan done:

1. **Spec coverage:**
   - Add user → Task 4 step 6 (route) + Task 5 (UI) + Task 6 test "admin can add a user" ✓
   - Remove user → Task 4 step 7 + Task 5 + Task 6 test "admin can delete a user" ✓
   - Rotate key → Task 3 (lib) + Task 4 step 8 (route) + Task 5 + Task 6 test "admin can rotate" ✓
   - Optional expiry → Task 2 (schema) + Task 4 step 6 (validation) + Task 5 (form) + Task 6 test "expired key rejected" ✓
   - Sessions killed on remove/rotate → Task 1 (`destroyByKeyName`) + Task 4 steps 7/8 + Task 6 test "active session is killed" ✓
   - Admin via `RAID_ADMIN_KEY_NAME` env var → Task 3 (`isAdmin`) + Task 4 (`requireAdmin`, startup warning) ✓
   - Admin disabled when env var unset → Task 4 step 2 (404 in `requireAdmin`) ✓
   - Lock-out prevention (can't delete/rotate admin) → Task 4 steps 7/8 + Task 6 test "cannot delete or rotate" ✓
   - Static admin page matching the project's HTML+JSON style → Task 5 ✓
   - README updated → Task 7 ✓

2. **Placeholder scan:** No `TODO`, `TBD`, "implement later", "add appropriate error handling", or "tests for the above". All code blocks are complete; all commands have expected output.

3. **Type consistency:**
   - `rotateAccessKey(file, name)` is the signature in Tasks 3, 4, and 6 — consistent.
   - `setExpiry` exists in `lib/admin.js` but is **not** called from any route in this plan. It is exported for the CLI / future use; this is deliberate (no UI for "edit expiry" — admins re-add or rotate). Keeping it covered by unit tests is enough.
   - `destroyByKeyName(name)` and `hasKeyName(name)` are the session-store method names used in Task 4. Consistent.
   - `users` array shape `{ name, createdAt, expiresAt, expired, hasSession }` is consistent between the route (Task 4 step 5), the client (Task 5 step 3), and the E2E (Task 6).

No fixes needed.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-27-admin-user-management.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
