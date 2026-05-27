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

  const bannerValue = page.locator('#admin-banner-value');
  await expect(bannerValue).not.toBeEmpty();
  const value = await bannerValue.innerText();
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

  const rotateBanner = page.locator('#admin-banner-value');
  await expect(rotateBanner).not.toBeEmpty();
  const newValue = await rotateBanner.innerText();
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
