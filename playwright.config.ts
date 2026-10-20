import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  timeout: 15000,
  fullyParallel: true,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  outputDir: 'test-results',
  use: { baseURL: 'http://127.0.0.1:4318', browserName: 'chromium', headless: true, trace: 'retain-on-failure' },
  webServer: { command: 'node tests/browser/server.mjs', url: 'http://127.0.0.1:4318', reuseExistingServer: false, timeout: 15000 },
})
