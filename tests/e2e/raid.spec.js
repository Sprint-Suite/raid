const { test, expect } = require('@playwright/test');

const TEST_KEY = 'E2E-Test-Key-12345';

// Default: every test runs already-signed-in. Tests that exercise the
// signed-out flow opt out by calling page.context().clearCookies().
test.beforeEach(async ({ context }) => {
  const res = await context.request.post('/api/login', {
    data: { key: TEST_KEY }
  });
  if (res.status() !== 200) {
    throw new Error(`Test setup login failed: ${res.status()}`);
  }
});

// ---------- Mocked /extract responses ----------

const MOCK_BASIC = {
  risks: [
    { title: 'Vendor late', description: 'Vendor may miss', owner: 'Sarah',
      probability: 4, impact: 4, severity: 16, rag: 'Red', mitigation: 'Confirm by Friday' }
  ],
  assumptions: [
    { title: 'Data is clean', description: 'Assumed clean', owner: 'Unassigned', validation_needed: 'Run a spot check' }
  ],
  issues: [
    { title: 'Staging down', description: 'Blocking', owner: 'Platform', severity: 'High', suggested_action: 'Page on-call' }
  ],
  dependencies: [
    { title: 'Migration script', description: 'Required', owner: 'Dev team', depends_on: 'Platform', conflict_flag: false, conflict_note: '' }
  ]
};

const MOCK_CONFLICT = {
  risks: [],
  assumptions: [],
  issues: [],
  dependencies: [
    { title: 'Design system', description: 'Blocking dev', owner: 'Dev', depends_on: 'UX team', conflict_flag: true, conflict_note: 'UX team also blocks a11y audit' },
    { title: 'A11y audit', description: 'Blocking compliance', owner: 'Compliance', depends_on: 'UX team', conflict_flag: true, conflict_note: 'UX team also blocks design system' }
  ]
};

async function mockExtract(page, response, status = 200) {
  await page.route('**/extract', (route) => {
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(response)
    });
  });
}

// ---------- Scenarios 1-4: load + generate paths ----------

test('1. Page loads with sample 1 pre-loaded and privacy chip visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1.hero__title')).toHaveText('RAID');
  const textarea = page.locator('#notes-textarea');
  await expect(textarea).not.toBeEmpty();
  const val = await textarea.inputValue();
  expect(val.toLowerCase()).toContain('project status');
  await expect(page.locator('.privacy-chip')).toBeVisible();
  await expect(page.locator('#generate-button')).toBeEnabled();
  await expect(page.locator('#result-zone')).toBeHidden();
});

test('2. Generate (mocked 200) renders 2x2 grid with action bar', async ({ page }) => {
  await mockExtract(page, MOCK_BASIC);
  await page.goto('/');
  await page.click('#generate-button');
  await expect(page.locator('.raid-card')).toHaveCount(4);
  await expect(page.locator('.action-bar')).toBeVisible();
  await expect(page.locator('#copy-md-button')).toBeVisible();
  await expect(page.locator('#dl-csv-button')).toBeVisible();
  await expect(page.locator('#dl-jira-button')).toBeVisible();
  await expect(page.locator('#try-another-button')).toBeVisible();
});

test('3. Generate (mocked 502) renders error card with Try-again', async ({ page }) => {
  await mockExtract(page, { error: 'fail' }, 502);
  await page.goto('/');
  await page.click('#generate-button');
  await expect(page.locator('.error-card')).toBeVisible();
  await expect(page.locator('#try-again-button')).toBeVisible();
  await expect(page.locator('.error-card__message')).toContainText('Extraction failed');
});

test('4. Try-again (mocked 200) recovers from error', async ({ page }) => {
  let callCount = 0;
  await page.route('**/extract', (route) => {
    callCount++;
    if (callCount === 1) {
      route.fulfill({ status: 502, body: JSON.stringify({ error: 'fail' }) });
    } else {
      route.fulfill({ status: 200, body: JSON.stringify(MOCK_BASIC) });
    }
  });
  await page.goto('/');
  await page.click('#generate-button');
  await expect(page.locator('.error-card')).toBeVisible();
  await page.click('#try-again-button');
  await expect(page.locator('.raid-card')).toHaveCount(4);
});

// ---------- Scenarios 5-8: cycle, copy, download, conflict ----------

test('5. Try-another-sample cycles textarea and auto-generates', async ({ page }) => {
  await mockExtract(page, MOCK_BASIC);
  await page.goto('/');
  const before = await page.locator('#notes-textarea').inputValue();
  await page.click('#generate-button');
  await expect(page.locator('.raid-card')).toHaveCount(4);

  await page.click('#try-another-button');
  await expect(page.locator('.raid-card')).toHaveCount(4);
  const after = await page.locator('#notes-textarea').inputValue();
  expect(after).not.toEqual(before);
});

test('6. Copy as Markdown shows "Copied ✓" briefly', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-write', 'clipboard-read']);
  await mockExtract(page, MOCK_BASIC);
  await page.goto('/');
  await page.click('#generate-button');
  await expect(page.locator('.raid-card')).toHaveCount(4);

  await page.click('#copy-md-button');
  await expect(page.locator('#copy-md-button')).toHaveText('Copied ✓');

  await expect(page.locator('#copy-md-button')).toHaveText('Copy as Markdown', { timeout: 3000 });
});

test('7. Download CSV produces a file with expected filename', async ({ page }) => {
  await mockExtract(page, MOCK_BASIC);
  await page.goto('/');
  await page.click('#generate-button');
  await expect(page.locator('.raid-card')).toHaveCount(4);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#dl-csv-button')
  ]);
  expect(download.suggestedFilename()).toMatch(/^raid-log-\d{4}-\d{2}-\d{2}\.csv$/);
});

test('8. Conflict mock triggers card modifier, corner chip, callouts', async ({ page }) => {
  await mockExtract(page, MOCK_CONFLICT);
  await page.goto('/');
  await page.click('#generate-button');
  const depsCard = page.locator('.raid-card[data-category="dependencies"]');
  await expect(depsCard).toHaveClass(/raid-card--conflict/);
  await expect(depsCard.locator('.raid-card__corner-chip')).toBeVisible();
  await expect(depsCard.locator('.raid-item__conflict-pill')).toHaveCount(2);
  await expect(depsCard.locator('.raid-item__conflict-callout')).toHaveCount(2);
});

// ---------- Scenarios 9-11: validation + mobile ----------

test('9. Empty textarea disables Generate with helper text', async ({ page }) => {
  await page.goto('/');
  await page.fill('#notes-textarea', '');
  await expect(page.locator('#generate-button')).toBeDisabled();
  await expect(page.locator('#notes-helper')).toBeVisible();
  await expect(page.locator('#notes-helper')).toContainText('at least 10 characters');
});

test('10. Over-1MB input disables Generate with err counter', async ({ page }) => {
  await page.goto('/');
  const big = 'a '.repeat(550_000);
  await page.locator('#notes-textarea').fill(big);
  await expect(page.locator('#generate-button')).toBeDisabled();
  await expect(page.locator('#notes-counter')).toHaveClass(/input-card__counter--err/);
});

test('11. Mobile viewport (375px) collapses grid and stacks action bar', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await mockExtract(page, MOCK_BASIC);
  await page.goto('/');
  await page.click('#generate-button');
  await expect(page.locator('.raid-card')).toHaveCount(4);

  const grid = page.locator('.result-grid');
  const cols = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns);
  expect(cols.split(' ').length).toBe(1);

  const firstBtn = page.locator('.action-bar .btn').first();
  const btnWidth = await firstBtn.evaluate((el) => el.getBoundingClientRect().width);
  expect(btnWidth).toBeGreaterThan(300);
});

// ---------- Scenarios 12-14: auth flow ----------

test('12. Unauthenticated GET / redirects to /login.html', async ({ page, context }) => {
  await context.clearCookies();
  const response = await page.goto('/');
  // Playwright follows the redirect; final URL should be the login page
  expect(page.url()).toMatch(/\/login\.html$/);
  expect(response.status()).toBe(200);
  await expect(page.locator('#login-form')).toBeVisible();
});

test('13. POST /api/login with wrong key shows error on page', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto('/login.html');
  await page.fill('#key-input', 'wrong-key-attempt-here');
  await page.click('#login-submit');
  await expect(page.locator('#login-error')).toBeVisible();
  await expect(page.locator('#login-error')).toContainText('Invalid key');
});

test('14. Logout button clears session and redirects to /login.html', async ({ page }) => {
  await page.goto('/');
  // Confirm we're on the main app (logged in via beforeEach)
  await expect(page.locator('#generate-button')).toBeVisible();

  await page.click('#logout-button');
  // After logout we expect to land on /login.html
  await page.waitForURL(/\/login\.html$/);
  await expect(page.locator('#login-form')).toBeVisible();
});
