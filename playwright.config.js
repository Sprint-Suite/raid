const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  reporter: 'list',
  timeout: 30 * 1000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:3003',
    headless: true,
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'PORT=3003 ANTHROPIC_API_KEY=dummy-for-e2e HUB_BASE_URL=http://127.0.0.1:9 HUB_API_KEY=dummy APP_SESSIONS_DB=/tmp/raid-e2e-sessions.db node server.js',
    url: 'http://localhost:3003/health',
    reuseExistingServer: !process.env.CI,
    timeout: 10_000
  }
});
