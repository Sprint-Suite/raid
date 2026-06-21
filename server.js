// server.js
//
// Express entry. Authentication is delegated to the central Sprint Suite hub
// via @suite/auth-client: users sign in at the hub and launch RAID with a
// one-time launch token (/auth/launch). Protected routes use auth.requireAuth,
// which validates the local app session and bounces to the hub when absent or
// expired. This app no longer owns any login/session/access-key code.

const express = require('express');
const path = require('node:path');
const { createAuthClient } = require('@suite/auth-client');
const { extract } = require('./lib/extract.js');
const { createExtractHandler } = require('./lib/extractHandler.js');
const { getBuildInfo } = require('./lib/buildInfo.js');
const { logger } = require('./lib/logger.js');
const { makeRequestLogger } = require('./middleware/requestLogger.js');
const { makeErrorHandler } = require('./middleware/errorHandler.js');
const { makeSecurityHeaders } = require('./middleware/securityHeaders.js');

const PORT = process.env.PORT || 3003;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.RAID_MODEL || 'claude-sonnet-4-5';
const BUILD = getBuildInfo(__dirname);

const auth = createAuthClient({
  appName: process.env.APP_NAME || 'raid',
  hubBaseUrl: process.env.HUB_BASE_URL,
  hubApiKey: process.env.HUB_API_KEY,
  cookieName: 'raid_session',
  cookieDomain: process.env.COOKIE_DOMAIN,
  dbPath: process.env.APP_SESSIONS_DB || './data/raid-sessions.db',
});

const app = express();
app.disable('x-powered-by');
app.use(makeRequestLogger(logger));
app.use(express.json({ limit: '1mb' }));
app.set('trust proxy', true); // for req.ip behind a reverse proxy
app.use(makeSecurityHeaders());

// ---------------------------------------------------------------------------
// Auth hub integration (launch / logout / heartbeat + browser heartbeat asset)
// ---------------------------------------------------------------------------
app.use('/auth-client', auth.staticAssets);
app.get('/auth/launch', auth.handleLaunch);
app.get('/auth/logout', auth.handleLogout);
app.get('/auth/whoami', auth.handleWhoami);
app.post('/api/heartbeat', auth.handleHeartbeat);

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
// Public pages + API
// ---------------------------------------------------------------------------
app.get('/license.html', (_req, res) => res.sendFile(path.join(publicDir, 'license.html')));
app.get('/robots.txt',   (_req, res) => res.sendFile(path.join(publicDir, 'robots.txt')));
app.get('/health',       (_req, res) => res.json({ ok: true, model: MODEL }));
app.get('/build',        (_req, res) => res.json(BUILD));

// ---------------------------------------------------------------------------
// Protected pages and API
// ---------------------------------------------------------------------------
app.get('/', auth.requireAuth, (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.post('/extract', auth.requireAuth,
  createExtractHandler({ auth, extract, apiKey: API_KEY, model: MODEL }));

app.use(makeErrorHandler({ logger, nodeEnv: process.env.NODE_ENV }));

app.listen(PORT, () => logger.info({ port: Number(PORT), model: MODEL }, 'raid listening'));
