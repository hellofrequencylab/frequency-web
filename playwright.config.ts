// Playwright smoke + a11y + visual-snapshot harness (RETHEME safety net).
//
// No local server is spawned: point PW_BASE_URL at a Vercel preview URL or an
// already-running dev server. Without PW_BASE_URL every spec skips itself, so
// `playwright test --list` and CI collection always work.
//
// TAG CONTRACT (the greps live in package.json, not here — setting grep/grepInvert in
// this file would silently intersect with the CLI flags and empty the run):
//   @smoke  — reachability + no-500 checks.        default run
//   @a11y   — axe-core WCAG A/AA gate.             default run  (no baseline dependency;
//                                                  see the rationale in a11y.spec.ts)
//   @visual — pixel baselines.                     OPT-IN ONLY (`--grep @visual`), because
//                                                  a missing baseline is noise, not signal.
// So `pnpm test:e2e` (`--grep-invert @visual`) stays correct as written: it runs smoke +
// a11y and excludes exactly the one suite that needs committed PNGs.
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
  // 30s (the default) was tight once a test became "cold-start a preview route, wait out a
  // capped networkidle, wait out font swap, THEN run axe or take a full-page capture".
  timeout: 60_000,
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
    // Vercel preview deployments sit behind Deployment Protection: without the
    // bypass header every SSR route serves Vercel's auth interstitial (viewport-tall
    // pages, /login redirects) and both e2e suites test the wall, not the app.
    // Set VERCEL_AUTOMATION_BYPASS_SECRET (Vercel project settings -> Deployment
    // Protection -> Protection Bypass for Automation) to run against previews;
    // production needs no header.
    ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? {
          extraHTTPHeaders: {
            'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
            'x-vercel-set-bypass-cookie': 'true',
          },
        }
      : {}),
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
