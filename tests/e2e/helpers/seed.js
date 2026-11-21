// Seeds a RAID app session straight into the e2e sessions DB (see playwright.config.js),
// so specs can load the auth-gated '/' without a running hub.
const { createSessionsStore } = require('@suite/auth-client/lib/sessions-db.js');

const DB = '/tmp/raid-e2e-sessions.db';

async function signIn(context, { id = 's-e2e', userId = 'u-e2e' } = {}) {
  const store = createSessionsStore(DB);
  store.delete(id);
  store.create({
    id, userId, centralSessionId: 'c-e2e', expiresAt: Date.now() + 60 * 60 * 1000,
    entitled: true, company: { id: 'co1', name: 'Acme Co' },
  });
  await context.addCookies([{
    name: 'raid_session', value: id, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax',
  }]);
}

module.exports = { signIn };
