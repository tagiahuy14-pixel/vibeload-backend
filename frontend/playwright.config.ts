import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'

// This browser is a disposable test runner; it never opens a user's profile.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.cache/ms-playwright')

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: 0,
  outputDir: './test-results',
  reporter: [['list'], ['json', { outputFile: '.qa/e2e-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    ignoreHTTPSErrors: true, // Only our self-signed local fixture origin.
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--host-resolver-rules=MAP media.vibeload.test 127.0.0.1', '--no-proxy-server'] },
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    { command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI, timeout: 30_000 },
    { command: 'node scripts/test-fixture-server.mjs', url: 'https://127.0.0.1:8443/health', ignoreHTTPSErrors: true, reuseExistingServer: !process.env.CI, timeout: 30_000 },
  ],
})
