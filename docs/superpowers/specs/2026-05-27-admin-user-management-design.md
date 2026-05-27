# Admin User Management — Design Spec

**Status:** Approved (2026-05-27)
**Goal:** Let the admin manage per-user access keys from the browser — add, remove, rotate, optionally expire — without SSHing into the server.

---

## Why

The CLI (`manageKeys.js`) already supports per-user keys, but demoing to colleagues means SSHing in to generate, then SSHing in again to clean up. A web admin page removes that friction and adds two things the CLI does not have: **key rotation** and **optional expiry**.

## Non-goals

- Email magic links / self-service signup. Keys are hand-delivered (Slack, email, etc.).
- Multi-admin / role hierarchy. One hardcoded admin via env var.
- Audit log / activity history.
- Server-rendered admin (the rest of the app is static HTML + JSON API).

---

## Architecture

```
Browser /admin.html  ──┐
                       ├──► /api/admin/users        (GET, POST, DELETE)
                       │    /api/admin/users/:name/rotate (POST)
                       │      requireAuth + requireAdmin
                       ▼
                  lib/admin.js
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
  lib/accessKeys.js  session.js   keys.json (extended)
```

One new HTML page, one new client-side JS file, one new lib module, one new middleware, four new endpoints. `lib/accessKeys.js` and `lib/session.js` get small additive changes.

---

## Components

### `lib/admin.js` (new)

Pure functions over `keys.json` plus the session store. Three operations beyond what `accessKeys.js` already exposes:

- `rotateAccessKey(file, name)` → `{ name, value }`. Generates a new salt + plaintext, rewrites the record (preserves name and `expiresAt`; updates `createdAt` to the rotation time). Throws `AccessKeyError('NAME_NOT_FOUND')` if the name does not exist.
- `setExpiry(file, name, expiresAt | null)` → `{ name, expiresAt }`. Writes or clears the `expiresAt` field (epoch millis). Throws if name missing.
- `isAdmin(keyName, env = process.env)` → boolean. Compares `keyName` to `env.RAID_ADMIN_KEY_NAME`.

### `lib/accessKeys.js` (additive change)

Schema extension: each record may now contain `expiresAt: number` (epoch millis, optional).

`verifyAccessKey` gains one check: if `record.expiresAt && Date.now() > record.expiresAt`, treat as inactive (`continue`). Same code path that already skips `active: false` keys. Existing tests still pass — records without `expiresAt` behave identically.

`createAccessKey` accepts an optional `expiresAt` in its options object and writes it when provided.

### `lib/session.js` (additive change)

New method `destroyByKeyName(name)`: iterates `store` entries, deletes any whose `keyName === name`. O(n) over current sessions — negligible at this scale (n is at most ~dozens for a demo).

### `server.js` (changes)

- New middleware `requireAdmin(req, res, next)`: requires `req.session` to exist (i.e. chained after `requireAuth`) and `isAdmin(req.session.keyName)` to be true. Otherwise 404 (not 403 — see Error Handling).
- New route `GET /admin.html`: serves `public/admin.html` behind `requireAuth + requireAdmin`. Like `/`, it redirects unauthenticated browsers to `/login.html`; admin failure returns 404.
- New routes under `/api/admin/users`, all behind `requireAuth + requireAdmin`:
  - `GET /api/admin/users` → list.
  - `POST /api/admin/users` → add.
  - `DELETE /api/admin/users/:name` → remove.
  - `POST /api/admin/users/:name/rotate` → rotate.
- Startup check: if `RAID_ADMIN_KEY_NAME` is set but no matching key exists in `keys.json`, log a warning at boot.

### `public/admin.html` + `public/js/admin.js` (new)

Single page. Static HTML + vanilla JS, matching the style of `public/login.html` and the main app. No build step.

Layout:
- **Header** — "RAID admin" + signed-in name + logout link.
- **Just-generated key banner** — appears at the top after add/rotate. Contains the plaintext key in a copy-to-clipboard `<code>` box and a "Dismiss" button. Disappears on dismiss or page refresh. Never repopulated.
- **Add user form** — name input + optional "expires in N days" input + "Generate" button. Posts to `POST /api/admin/users`.
- **Users table** — columns: Name · Created · Expires · Signed in now · Actions. Two row actions: "Rotate" and "Delete". Both confirm-on-click.

A small status line shows the last operation outcome ("Added 'alice'", "Rotated 'bob'", "Deleted 'carol'"). Error responses surface in the same line.

---

## Data flow

### Add user
1. `POST /api/admin/users` with `{ name: string, expiresInDays?: number }`.
2. Validate `name` against existing `KEY_NAME_PATTERN`. Validate `expiresInDays` is a positive integer ≤ 365 if present.
3. Compute `expiresAt = Date.now() + expiresInDays * 86_400_000` if provided.
4. Call `createAccessKey(file, name, { expiresAt })`.
5. Response: `200 { name, value, expiresAt: number | null }`. The plaintext `value` exists only in this response; it is never logged and cannot be re-fetched.

### Remove user
1. `DELETE /api/admin/users/:name`.
2. If `:name === RAID_ADMIN_KEY_NAME`, reject with `400 { error: "Cannot delete the admin key from the web UI. Use the CLI." }`.
3. Call `removeAccessKey(file, name)`.
4. Call `sessions.destroyByKeyName(name)`.
5. Response: `200 { ok: true }`.

### Rotate key
1. `POST /api/admin/users/:name/rotate`.
2. If `:name === RAID_ADMIN_KEY_NAME`, reject with `400 { error: "Cannot rotate the admin key from the web UI. Use the CLI." }`. (Footgun guard during demos.)
3. Call `rotateAccessKey(file, name)` — new salt, new plaintext, same record otherwise.
4. Call `sessions.destroyByKeyName(name)` — old session is killed; the user must log in again with the new value.
5. Response: `200 { name, value }`. Plaintext shown once in the UI.

### List users
1. `GET /api/admin/users`.
2. Build the response from `listAccessKeys(file)` + a scan of the session store for `hasSession`.
3. Response: `200 { users: [{ name, createdAt, expiresAt, expired, hasSession }, ...] }`. Never includes `hash` or `salt`.

### Expiry enforcement
- **At login.** `verifyAccessKey` skips expired records, so logins with an expired key fail with the same 401 as an unknown key.
- **For existing sessions.** Sessions are killed when a key is removed or rotated. An expired-but-not-removed key keeps its existing session valid until the cookie TTL ends. This is deliberate — checking per-request adds cost and complexity for marginal benefit at demo scale.

---

## Error handling & edge cases

- **Lock-out prevention.** Delete and rotate refuse to operate on `RAID_ADMIN_KEY_NAME` (400). Admin-key management stays on the CLI.
- **Admin not configured.** If `RAID_ADMIN_KEY_NAME` is unset, `/admin.html` and every `/api/admin/*` route return 404. The surface looks like it does not exist. This is intentional: a misconfigured prod box should not advertise admin endpoints.
- **Admin name doesn't match a key.** If the env var names a key that does not exist, no one can pass `requireAdmin`, so admin appears 404 to everyone. Logged once at server start so the operator notices on boot.
- **Concurrent writes to `keys.json`.** Single Node process, synchronous `writeFileSync`, single event loop — no new locking needed. The admin UI is single-user (one admin) so contention is not realistic anyway.
- **Rate limiting.** The existing login rate limiter still applies to `/api/login`. Admin endpoints sit behind an authenticated admin session — no new limiter.
- **Name validation.** Reuse `KEY_NAME_PATTERN` from `accessKeys.js` unchanged.
- **Expiry value validation.** `expiresInDays` must be an integer in `[1, 365]`. Reject anything else with 400.
- **Plaintext leakage.** The just-generated value lives only in the JSON response, the admin's browser tab, and the clipboard if they copy it. It is not in any log, response cache, or `keys.json`. Page refresh clears it.

---

## Schema change

`keys.json` records, before:
```json
{ "alice": { "hash": "...", "salt": "...", "active": true, "createdAt": "2026-05-26T..." } }
```

After (additive, backwards compatible — no migration script):
```json
{ "alice": { "hash": "...", "salt": "...", "active": true, "createdAt": "2026-05-26T...", "expiresAt": 1748390400000 } }
```

`expiresAt` is omitted when the key does not expire. Existing records keep working.

---

## Configuration

| Env var | Default | Required | Notes |
|---|---|---|---|
| `RAID_ADMIN_KEY_NAME` | unset | no | Name of the key that gets admin access. Unset disables the admin UI entirely. |

No changes to existing env vars.

---

## Testing

**Unit (`tests/admin.test.js`)** — calls `lib/admin.js` and the extended `lib/accessKeys.js` against a temp `keys.json`:
- `createAccessKey` with `expiresAt` writes the field; without, the field is absent.
- `verifyAccessKey` rejects an expired record exactly as it rejects `active: false`.
- `rotateAccessKey` produces a new plaintext, a new hash, preserves the name, and lets the new value pass `verifyAccessKey` while the old value fails.
- `setExpiry` writes and clears `expiresAt`.
- `isAdmin` matches against `RAID_ADMIN_KEY_NAME` exactly.
- The 400-guards on `DELETE` / `rotate` for the admin name are enforced at the route handler (covered in the E2E layer).

**E2E (`tests/admin.e2e.spec.js`)** — Playwright, no live Anthropic calls (admin flow does not touch the API):
- Admin logs in, navigates to `/admin`, adds a user with a 7-day expiry, copies the plaintext.
- Sign out, sign in as the new user — succeeds.
- Sign back in as admin, rotate that user's key, copy the new plaintext.
- Confirm the old plaintext now fails login (401).
- Confirm the new plaintext succeeds.
- Sign back in as admin, delete the user.
- Confirm any active session for that user is dead on its next request (redirected to `/login`).
- Confirm a non-admin user hitting `/admin.html` or `/api/admin/users` gets 404, not 403.

---

## Out of scope (explicit)

- Email magic links.
- Multi-admin or RBAC.
- Audit log of admin actions.
- Per-key permissions beyond "admin or not".
- Per-request expiry enforcement for already-authenticated sessions.
- Rotating the admin's own key from the web UI.
