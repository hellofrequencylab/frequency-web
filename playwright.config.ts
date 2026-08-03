// Playwright smoke + visual-snapshot harness (RETHEME safety net).
//
// No local server is spawned: point PW_BASE_URL at a Vercel preview URL or an
// already-running dev server. Without PW_BASE_URL every spec skips itself, so
// `playwright test --list` and CI collection always work.
//
// See test/e2e/README.md for the run/baseline workflow.
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// This container pre-installs Chromium at PLAYWRIGHT_BROWSERS_PATH
// (/opt/pw-browsers). The pinned @playwright/test may expect a different
// browser revision than the one on disk, so when the well-known symlink
// exists we point launches straight at it. Anywhere the symlink is absent
// (e.g. GitHub Actions after `playwright install chromium`) Playwright's
// own resolution applies.
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium';
const executablePath = existsSync(PREINSTALLED_CHROMIUM)
  ? PREINSTALLED_CHROMIUM
  : undefined;

export default defineConfig({
  testDir: './test/e2e',
  // Keep all baselines in one predictable folder, keyed by spec + project.
  snapshotPathTemplate:
    '{testDir}/__screenshots__/{testFileName}/{arg}-{projectName}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  expect: {
    toHaveScreenshot: {
      // Deterministic captures: freeze animations, hide the caret, snapshot
      // at CSS pixel scale, and tolerate sub-2% pixel drift (fonts/AA).
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixelRatio: 0.02,
    },
  },
  use: {
    baseURL: process.env.PW_BASE_URL,
    trace: 'on-first-retry',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 14'],
        // Only Chromium ships in this environment; emulate the phone with it.
        browserName: 'chromium',
        defaultBrowserType: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
      },
    },
  ],
});
