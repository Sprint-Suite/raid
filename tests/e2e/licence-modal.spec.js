const { test, expect } = require('@playwright/test');
const { signIn } = require('./helpers/seed');

for (const p of ['/license', '/licence', '/license.html']) {
  test(`${p} permanently redirects to the Hub licence`, async ({ request }) => {
    const res = await request.get(p, { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers()['location']).toBe('https://sprintsuite.uk/license');
  });
}

test('the tool page renders its band and opens the licence in a popup', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await signIn(context);
  await page.goto('/');

  const band = page.locator('.band').first();
  await expect(band).toBeVisible();
  await expect.poll(async () => band.locator('.waves svg').count(), { timeout: 3000 }).toBeGreaterThan(0);

  await page.locator('a[data-licence-modal]').click();
  const dialog = page.locator('dialog.licence-modal');
  await expect(dialog).toHaveAttribute('open', '');
  await expect(page.locator('#licence-modal-title')).toBeFocused();
  await expect(dialog).toContainText('1. Grant of licence.');
  expect(new URL(page.url()).pathname).toBe('/');

  await page.keyboard.press('Escape');
  await expect(dialog).not.toHaveAttribute('open', '');
  expect(errors, errors.join('\n')).toHaveLength(0);
});
