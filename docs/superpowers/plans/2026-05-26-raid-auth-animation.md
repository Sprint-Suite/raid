# RAID Auth + Animation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add scrumpoker-style key-based authentication and the suite's breathing-waves ambient animation to the RAID app. Stop casual visitors when the app is pushed live; match suite visual identity.

**Architecture:** Salted SHA-256 access keys stored in `keys.json` (gitignored). In-memory session store keyed by HttpOnly cookie. IP-based rate limiter on `/api/login`. `/`, `/extract`, and `/api/logout` require a valid session; `/login.html`, `/api/login`, and static assets are public. Breathing-waves canvas is added to both login and main pages with a forest palette.

**Tech Stack:** Same as MVP — Express, vanilla JS/CSS, CommonJS, `node --test` + Playwright. New dep: `cookie-parser`.

**Spec source:** This plan is the spec — the asks are mechanical (lift suite patterns) and don't merit a separate design doc.

---

## Plan overview

| Phase | What lands |
|---|---|
| **A. Auth foundation** | `lib/accessKeys.js`, `lib/session.js`, `lib/loginRateLimiter.js`, `manageKeys.js`, unit tests |
| **B. Routes & middleware** | `/api/login`, `/api/logout`, `/api/me`, auth middleware protecting `/` and `/extract`, first key generated |
| **C. Login UI** | `login.html`, `login.js`, login styles |
| **D. Animation** | `breathing-waves.css` + `.js` copied, forest palette, wired into both pages |
| **E. Tests + tag** | E2E coverage for redirect / login / logout, all tests green, tag v0.2.0 |

---

## Phase A — Auth foundation

### Task A.1: Add cookie-parser dependency

- [ ] Run: `npm install cookie-parser`
- [ ] Commit: `chore: add cookie-parser`

### Task A.2: Write lib/accessKeys.js (slim adaptation of scrumpoker's)

**Files:** Create `/var/www/raid/lib/accessKeys.js`

Lift the salted SHA-256 + load/save + add/remove patterns from `/var/www/scrumpoker/lib/accessKeys.js`. Drop legacy plaintext migration, room-state references, and the fingerprinting helpers — RAID is simpler.

The slim file should expose:
- `getKeysFilePath(baseDir)` — resolves env var `RAID_KEYS_FILE` or falls back to `<baseDir>/keys.json`
- `loadAccessKeys(file)` — JSON parse + shape validation, returns `Map<name, {hash, salt, active, createdAt}>`
- `verifyAccessKey(file, candidate)` — checks candidate against all active stored keys; returns `{ok, name}` on match else `{ok:false}`
- `createAccessKey(file, name)` — generates 16-char random key, hashes, saves; returns `{name, value}` so CLI prints it once
- `listAccessKeys(file)` — returns `[{name, active, createdAt}, ...]`
- `removeAccessKey(file, name)` — deletes; returns `{name}` or throws
- `AccessKeyError` — error class

Constants:
- `MIN_ACCESS_KEY_LENGTH = 12`
- `ACCESS_KEY_SALT_BYTES = 16`
- `DEFAULT_GENERATED_LENGTH = 16` (slightly longer than scrumpoker's 12 — same alphabet)

Hash: `crypto.createHash('sha256').update(salt + ':' + value).digest('hex')`.

- [ ] Verify: `node -e "require('/var/www/raid/lib/accessKeys.js'); console.log('ok')"` prints `ok`
- [ ] Commit: `feat(auth): add accessKeys module (salted SHA-256)`

### Task A.3: Unit tests for accessKeys

**Files:** Create `/var/www/raid/tests/accessKeys.unit.test.js`

Tests:
- `verifyAccessKey` returns `{ok:true, name}` for the correct value
- `verifyAccessKey` returns `{ok:false}` for a wrong value
- `verifyAccessKey` returns `{ok:false}` for inactive keys
- `createAccessKey` produces a 16-char key, persists hash+salt, never persists plaintext
- `removeAccessKey` removes a named key
- `loadAccessKeys` throws `AccessKeyError` with code `KEYS_INVALID` for malformed JSON

Use a temp file path (`fs.mkdtempSync`) for each test so they don't share state.

- [ ] Run: `npm test` — expect new tests pass plus all existing
- [ ] Commit: `test(auth): unit tests for accessKeys`

### Task A.4: Write lib/session.js (in-memory session store)

**Files:** Create `/var/www/raid/lib/session.js`

Tiny in-memory session store. Exposes:
- `createSessionStore({ ttlMs = 7 * 24 * 60 * 60 * 1000 } = {})` returns an object with:
  - `start({ keyName })` → returns a random 32-byte base64url token; stores `{ keyName, expiresAt }` keyed by sha256(token) so the raw token never sits in memory
  - `get(rawToken)` → returns `{ keyName, expiresAt }` if found+unexpired, else `null`. Lazy-cleans expired entries on read.
  - `destroy(rawToken)` → removes the entry. Idempotent.
  - `size` getter for tests.

TTL default: 7 days (cookie + in-memory both expire then). Configurable via env `RAID_SESSION_TTL_MS` (default 7d).

- [ ] Verify: `node -e "const {createSessionStore} = require('/var/www/raid/lib/session.js'); const s = createSessionStore(); const t = s.start({keyName:'x'}); console.log(s.get(t))"` prints `{ keyName: 'x', expiresAt: ... }`
- [ ] Commit: `feat(auth): add in-memory session store`

### Task A.5: Unit tests for session

**Files:** Create `/var/www/raid/tests/session.unit.test.js`

Tests:
- `start` returns a random token (length > 30, two calls return different tokens)
- `get` returns `null` for unknown token
- `get` returns the entry for a valid token
- `get` returns `null` after `destroy`
- `get` returns `null` after the TTL elapses (use `ttlMs: 1`, await `setTimeout(5)`)
- Raw token is not stored: after `start`, no value in the internal map equals the raw token string

- [ ] Run: `npm test` — all green
- [ ] Commit: `test(auth): unit tests for session store`

### Task A.6: Copy lib/loginRateLimiter.js verbatim from scrumpoker

**Files:** Create `/var/www/raid/lib/loginRateLimiter.js` (lift from scrumpoker — only 54 lines, no changes needed)

- [ ] `cp /var/www/scrumpoker/lib/loginRateLimiter.js /var/www/raid/lib/loginRateLimiter.js`
- [ ] Verify: `node -e "require('/var/www/raid/lib/loginRateLimiter.js'); console.log('ok')"`
- [ ] Commit: `feat(auth): add loginRateLimiter (copied from scrumpoker)`

### Task A.7: Add manageKeys.js CLI

**Files:** Create `/var/www/raid/manageKeys.js`

Lift from `/var/www/scrumpoker/manageKeys.js`. The only adaptation is that our `lib/accessKeys.js` doesn't export `migrateKeysFile`, so drop the `migrate` command — RAID has no legacy keys.

Resulting commands:
- `node manageKeys.js generate <name>` — prints the generated key once; never readable again
- `node manageKeys.js list` — names + status
- `node manageKeys.js remove <name>`

- [ ] Run: `node manageKeys.js list` — prints "No keys found in keys.json." (or creates the file empty)
- [ ] Commit: `feat(auth): add manageKeys CLI`

---

## Phase B — Routes & middleware

### Task B.1: Wire cookie-parser + auth middleware into server.js

**Files:** Modify `/var/www/raid/server.js`

Add at the top (after existing requires):
```js
const cookieParser = require('cookie-parser');
const { getKeysFilePath, verifyAccessKey } = require('./lib/accessKeys.js');
const { createSessionStore } = require('./lib/session.js');
const { createLoginRateLimiter } = require('./lib/loginRateLimiter.js');
```

After the existing constants, add:
```js
const KEYS_FILE = getKeysFilePath(__dirname);
const sessions = createSessionStore();
const loginLimiter = createLoginRateLimiter();
const SESSION_COOKIE = 'raid_session';
const COOKIE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
```

Add middleware after `express.json` but before routes:
```js
app.use(cookieParser());

function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: 'Not signed in.' });
  const session = sessions.get(token);
  if (!session) {
    res.clearCookie(SESSION_COOKIE);
    return res.status(401).json({ error: 'Not signed in.' });
  }
  req.session = session;
  next();
}
```

- [ ] Verify: `node -e "require('/var/www/raid/server.js')"` doesn't crash (it will boot the server — Ctrl+C immediately)
- [ ] Commit: `feat(auth): wire session middleware`

### Task B.2: Restructure static serving (public assets always; pages guarded)

**Files:** Modify `/var/www/raid/server.js`

Replace the single `app.use(express.static(...))` with explicit asset routes (public) and explicit page routes (guarded). Order:

```js
// 1. Public static assets — anyone can fetch CSS/JS/fonts/illos/images
const publicDir = path.join(__dirname, 'public');
app.use('/css',    express.static(path.join(publicDir, 'css')));
app.use('/js',     express.static(path.join(publicDir, 'js')));
app.use('/fonts',  express.static(path.join(publicDir, 'fonts')));
app.use('/illos',  express.static(path.join(publicDir, 'illos')));
app.use('/images', express.static(path.join(publicDir, 'images')));

// 2. Public pages
app.get('/login.html',   (_req, res) => res.sendFile(path.join(publicDir, 'login.html')));
app.get('/license.html', (_req, res) => res.sendFile(path.join(publicDir, 'license.html')));

// 3. Public API
app.post('/api/login',  /* added in Task B.3 */);
app.get('/health',      (_req, res) => res.json({ ok: true, model: MODEL }));
app.get('/build',       (_req, res) => res.json(BUILD));

// 4. Protected pages and API (mount requireAuth from here)
app.get('/', requireAuth, (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.post('/extract', requireAuth, /* existing handler */);
app.post('/api/logout', requireAuth, /* added in Task B.3 */);
app.get('/api/me', requireAuth, /* added in Task B.3 */);
```

For `/extract` and the protected handlers: when auth fails, return JSON `401` for `/extract` (XHR will read it), but for GET `/` redirect the browser to `/login.html`. Adjust `requireAuth` to detect HTML requests via `Accept` header:

```js
function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  const session = token ? sessions.get(token) : null;
  if (!session) {
    if (token) res.clearCookie(SESSION_COOKIE);
    const wantsHtml = (req.headers.accept || '').includes('text/html');
    if (wantsHtml) return res.redirect('/login.html');
    return res.status(401).json({ error: 'Not signed in.' });
  }
  req.session = session;
  next();
}
```

- [ ] Manual check: with no `keys.json`, boot server, `curl -i http://localhost:3003/` → expect `302` to `/login.html`. `curl -i http://localhost:3003/login.html` → expect `200`.
- [ ] Commit: `feat(auth): protect / and /extract behind session middleware`

### Task B.3: Add /api/login, /api/logout, /api/me routes

**Files:** Modify `/var/www/raid/server.js`

Add the three handlers (Task B.2 already declared their slots; now fill them):

```js
app.post('/api/login', (req, res) => {
  const ip = req.ip || 'unknown';
  if (loginLimiter.isBlocked(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Please wait and try again.' });
  }
  const candidate = String(req.body?.key || '');
  let result;
  try {
    result = verifyAccessKey(KEYS_FILE, candidate);
  } catch (_err) {
    return res.status(500).json({ error: 'Server misconfigured.' });
  }
  if (!result.ok) {
    loginLimiter.recordFailure(ip);
    return res.status(401).json({ error: 'Invalid key.' });
  }
  loginLimiter.recordSuccess(ip);
  const token = sessions.start({ keyName: result.name });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_TTL_MS
  });
  res.status(200).json({ ok: true, name: result.name });
});

app.post('/api/logout', (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) sessions.destroy(token);
  res.clearCookie(SESSION_COOKIE);
  res.status(200).json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.status(200).json({ name: req.session.keyName });
});
```

- [ ] Manual check: with the server running and no keys, `curl -X POST http://localhost:3003/api/login -d '{"key":"x"}' -H "Content-Type: application/json"` → 401 `{"error":"Invalid key."}`.
- [ ] Commit: `feat(auth): add /api/login, /api/logout, /api/me`

### Task B.4: Generate the first access key

- [ ] Run: `node manageKeys.js generate david` — capture the printed key
- [ ] The key is printed once and never readable again from keys.json (only hash+salt stored)
- [ ] (No commit — keys.json is gitignored)

---

## Phase C — Login UI

### Task C.1: Add public/login.html

**Files:** Create `/var/www/raid/public/login.html`

A standalone page (not part of the main app shell) styled to match. Brand glyph + H1 "RAID" + Fraunces tagline + one input (`type="password"`) for the key + submit button + small error placeholder. Include theme-core, theme-raid, app.css, and a `<link rel="stylesheet" href="/css/login.css">` for login-specific styles. Add `<div class="header-band" data-breathing-waves data-wave-palette="raid"></div>` above the card so the animation appears once Phase D wires it.

- [ ] Commit: `feat(auth): add login.html`

### Task C.2: Add public/js/login.js

**Files:** Create `/var/www/raid/public/js/login.js`

On submit, POST `/api/login` with `{ key }`. On 200, redirect to `/`. On 401, show the error in the placeholder. On 429, show "Too many attempts. Please wait a few minutes." Clear error on input change.

- [ ] Commit: `feat(auth): wire login form`

### Task C.3: Add login-specific CSS

**Files:** Create `/var/www/raid/public/css/login.css`

Layout: centered card, dimmed cream background, breathing-waves canvas behind the card. Reuses `.btn`, `.input-card__textarea` patterns where it makes sense — but the input is a single-line password field, so it has its own class `.login-input`. Add a small "Logout" button to the main app shell (for after login) — see Task C.4.

- [ ] Commit: `feat(auth): add login page styles`

### Task C.4: Add logout affordance + auth check on main page

**Files:** Modify `/var/www/raid/public/index.html` and `/var/www/raid/public/js/app.js`

In `index.html`: add a small `<button id="logout-button" class="btn btn--ghost">Sign out</button>` in the footer, before the suite-links paragraph.

In `app.js`: in `init()`, also fetch `/api/me` and stash the keyName. Wire the logout button: POST `/api/logout`, then `window.location = '/login.html'`.

Also: `callExtract` should handle 401 by redirecting to `/login.html` — session may have expired mid-session.

- [ ] Commit: `feat(auth): logout button + 401 redirect on main page`

---

## Phase D — Animation

### Task D.1: Copy breathing-waves files + add 'raid' palette

**Files:**
- Create `/var/www/raid/public/css/breathing-waves.css` (copied from scrumpoker)
- Create `/var/www/raid/public/js/breathing-waves.js` (copied from scrumpoker)
- Modify `breathing-waves.js` to add `'raid'` palette entry

```bash
cp /var/www/scrumpoker/public/css/breathing-waves.css /var/www/raid/public/css/breathing-waves.css
cp /var/www/scrumpoker/public/js/breathing-waves.js /var/www/raid/public/js/breathing-waves.js
```

In the copied `breathing-waves.js`, find the `PALETTES` object and add:
```js
raid:   [[46,111,78],[143,191,159],[36,92,64],[99,150,112],[60,128,90]]
```

This is the forest accent (`#2E6F4E` = `46,111,78`) anchoring a 5-shade palette.

- [ ] Commit: `feat(animation): copy breathing-waves and add raid palette`

### Task D.2: Wire breathing-waves into index.html and login.html

**Files:** Modify `/var/www/raid/public/index.html` and `/var/www/raid/public/login.html`

Both pages get:
- `<link rel="stylesheet" href="/css/breathing-waves.css">` in `<head>`
- `<script src="/js/breathing-waves.js" defer></script>` in `<head>`
- A `<header class="header-band" data-breathing-waves data-wave-palette="raid"><canvas></canvas></header>` at the top of `<body>`, before the existing `<main>` (or above the entry card on the login page).

The header-band class comes from `breathing-waves.css` — it has the box dimensions and background gradient that the canvas overlays.

- [ ] Verify both pages: refresh, see the animated forest waves at the top of the page.
- [ ] Commit: `feat(animation): wire breathing-waves on index and login`

---

## Phase E — Tests + tag

### Task E.1: Add E2E tests for auth flow

**Files:** Modify `/var/www/raid/tests/e2e/raid.spec.js`

Existing 11 scenarios will break because `/` now requires auth. Two approaches: (a) seed a session via cookie before each test, or (b) start every test by clicking through login. Approach (a) is faster and avoids depending on a real keys.json.

Add a `test.beforeEach` that hits `/api/login` with a stubbed-server cookie OR — since Playwright `webServer` config starts a real server — set up a known key via env (`RAID_KEYS_FILE=tests/fixtures/test-keys.json`) and log in via the API at the start of each test.

Concretely:
1. Create `tests/fixtures/test-keys.json` with one known key (commit the file — it's a test fixture, not a production secret).
2. Update `playwright.config.js`'s `webServer.command` to include `RAID_KEYS_FILE=tests/fixtures/test-keys.json`.
3. Add `test.beforeEach(async ({ context }) => { await context.request.post('/api/login', { data: { key: 'TEST_KEY_VALUE' } }); })` at the top of the file (Playwright shares cookies in `context`).

Plus three new scenarios:
- 12. Unauthenticated GET `/` redirects to `/login.html`
- 13. POST `/api/login` with wrong key returns 401, error shown on page
- 14. Logout button clears session and redirects to `/login.html`

- [ ] Run: `npm run test:e2e` — 14/14 pass
- [ ] Commit: `test(e2e): cover auth flow (login, logout, redirect)`

### Task E.2: Final verification + tag v0.2.0

- [ ] `npm test` — all unit tests pass (including new accessKeys and session tests)
- [ ] `npm run test:e2e` — 14/14 pass
- [ ] Manual browser check: visit `/`, get redirected to `/login.html`, see breathing-waves animation, enter the key generated in B.4, get into the main app, breathing-waves visible there too, click Sign out, back to login.
- [ ] Update README.md with auth section (how to generate a key, env vars `RAID_KEYS_FILE` and `RAID_SESSION_TTL_MS`).
- [ ] Commit: `docs: README auth section`
- [ ] Tag: `git tag -a v0.2.0 -m "v0.2.0 — Key-based auth + breathing-waves animation"`
- [ ] Push: `git push origin master && git push origin v0.2.0`
