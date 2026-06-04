// Raid's pages are hub-auth gated except /license.html and /health (public).
// The authed '/' route bounces to the hub (not running in tests), so it is
// intentionally not e2e-tested here — it's covered by the manual visual pass.
// This spec guards the core reskin wiring (foundation CSS + oscilloscope band)
// on the one public page that needs no auth.
const { test, expect } = require('@playwright/test');

test('license page renders the oscilloscope band with no console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/license.html');

  // Instrument chrome present
  await expect(page.locator('body.ins[data-app="raid"]')).toHaveCount(1);
  await expect(page.locator('.topbar .brand')).toBeVisible();

  // Oscilloscope mounted a trace into the band's .waves
  const band = page.locator('.band').first();
  await expect(band).toBeVisible();
  await expect.poll(async () => band.locator('.waves svg').count(), { timeout: 3000 }).toBeGreaterThan(0);

  expect(errors, errors.join('\n')).toHaveLength(0);
});
