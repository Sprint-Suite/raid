// server.js
//
// Express entry. Mounts /api/login, /api/logout, /api/me, /extract, /health,
// /build, and serves static assets. Guarded pages (/, /extract) require a
// valid session cookie. Public pages and assets remain reachable for the
// login flow.

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('node:path');
const { extract } = require('./lib/extract.js');
const { getBuildInfo } = require('./lib/buildInfo.js');
const {
  getKeysFilePath,
  verifyAccessKey,
  createAccessKey,
  listAccessKeys,
  removeAccessKey
} = require('./lib/accessKeys.js');
const { rotateAccessKey, isAdmin } = require('./lib/admin.js');
const { createSessionStore } = require('./lib/session.js');
const { createLoginRateLimiter } = require('./lib/loginRateLimiter.js');

const PORT = process.env.PORT || 3003;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.RAID_MODEL || 'claude-sonnet-4-5';
const BUILD = getBuildInfo(__dirname);

const KEYS_FILE = getKeysFilePath(__dirname);
const ADMIN_KEY_NAME = process.env.RAID_ADMIN_KEY_NAME || '';
const sessions = createSessionStore();
const loginLimiter = createLoginRateLimiter();
const SESSION_COOKIE = 'raid_session';
const COOKIE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.set('trust proxy', true); // for req.ip behind a reverse proxy

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

function requireAdmin(req, res, next) {
  if (!ADMIN_KEY_NAME) return res.status(404).end();
  if (!req.session || !isAdmin(req.session.keyName, process.env)) {
    return res.status(404).end();
  }
  next();
}

// ---------------------------------------------------------------------------
// Public static assets (anyone can fetch CSS, JS, fonts, illos, images)
// ---------------------------------------------------------------------------
const publicDir = path.join(__dirname, 'public');
app.use('/css',    express.static(path.join(publicDir, 'css')));
app.use('/js',     express.static(path.join(publicDir, 'js')));
app.use('/fonts',  express.static(path.join(publicDir, 'fonts')));
app.use('/illos',  express.static(path.join(publicDir, 'illos')));
app.use('/images', express.static(path.join(publicDir, 'images')));

// ---------------------------------------------------------------------------
// Public pages
// ---------------------------------------------------------------------------
app.get('/login.html',   (_req, res) => res.sendFile(path.join(publicDir, 'login.html')));
app.get('/license.html', (_req, res) => res.sendFile(path.join(publicDir, 'license.html')));
app.get('/robots.txt',   (_req, res) => res.sendFile(path.join(publicDir, 'robots.txt')));

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => res.json({ ok: true, model: MODEL }));
app.get('/build',  (_req, res) => res.json(BUILD));

app.post('/api/login', (req, res) => {
  const ip = req.ip || 'unknown';
  if (loginLimiter.isBlocked(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Please wait and try again.' });
  }
  const candidate = String(req.body?.key || '');
  let result;
  try {
    result = verifyAccessKey(KEYS_FILE, candidate);
  } catch (err) {
    console.error('verifyAccessKey failed:', err.message);
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

// ---------------------------------------------------------------------------
// Protected pages and API
// ---------------------------------------------------------------------------
app.get('/', requireAuth, (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.get(['/admin', '/admin.html'], requireAuth, requireAdmin, (_req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

app.get('/api/admin/users', requireAuth, requireAdmin, (_req, res) => {
  try {
    const users = listAccessKeys(KEYS_FILE).map(u => ({
      name: u.name,
      createdAt: u.createdAt,
      expiresAt: u.expiresAt,
      expired: u.expired,
      hasSession: sessions.hasKeyName(u.name)
    }));
    res.json({ users });
  } catch (err) {
    console.error('admin: listAccessKeys failed:', err.message);
    res.status(500).json({ error: 'Could not list keys.' });
  }
});

app.post('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'name is required.' });

  let expiresAt = null;
  const rawDays = req.body?.expiresInDays;
  if (rawDays !== undefined && rawDays !== null && rawDays !== '') {
    if (typeof rawDays !== 'number' && typeof rawDays !== 'string') {
      return res.status(400).json({ error: 'expiresInDays must be an integer between 1 and 365.' });
    }
    const days = Number(rawDays);
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

app.post('/api/logout', requireAuth, (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) sessions.destroy(token);
  res.clearCookie(SESSION_COOKIE);
  res.status(200).json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.status(200).json({ name: req.session.keyName });
});

app.post('/extract', requireAuth, async (req, res) => {
  const text = req.body?.text;
  if (typeof text !== 'string' || text.trim().length < 10) {
    return res.status(400).json({ error: "Provide 'text' (at least 10 chars) of project notes." });
  }
  if (!API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set on the server.' });
  }
  try {
    const raid = await extract(text, { apiKey: API_KEY, model: MODEL });
    res.json(raid);
  } catch (err) {
    console.error('extract failed twice:', err.message);
    res.status(502).json({ error: 'Extraction failed. Try rephrasing the notes and resubmit.' });
  }
});

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
