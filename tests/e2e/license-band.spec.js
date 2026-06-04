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
  await expect.poll(async () => band.locator('.waves svg').count()).toBeGreaterThan(0);

  expect(errors, errors.join('\n')).toHaveLength(0);
});
