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
//   @overflow — nothing runs off the side of a     default run  (no baseline dependency either;
//               phone, at 320/360/390.                          it MEASURES boxes rather than
//                                                               comparing pixels. ADR-1035.)
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
  // `*.spec.ts` ONLY. Playwright's default testMatch also picks up `*.test.ts`, which is
  // vitest's extension in this repo — and test/e2e now holds a vitest file
  // (shell-coverage.test.ts, the unit test for the coverage reporter's logic). Collected by
  // Playwright it fails the whole run at import with "Vitest cannot be imported in a CommonJS
  // module". Two runners, two extensions, one line to keep them apart.
  testMatch: '**/*.spec.ts',
  // Keep all baselines in one predictable folder, keyed by spec + project.
  snapshotPathTemplate:
    '{testDir}/__screenshots__/{testFileName}/{arg}-{projectName}{ext}',
  fullyParallel: true,
  // 30s (the default) was tight once a test became "cold-start a preview route, wait out a
  // capped networkidle, wait out font swap, THEN run axe or take a full-page capture".
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  // WORKERS. Playwright defaults to cores/2, which is 2 on a 4-vCPU ubuntu-latest runner,
  // and that default is tuned for CPU-bound suites. This one is not: every test navigates to
  // a REMOTE Vercel preview and then spends its time waiting -- on the network, on a capped
  // networkidle, on font swap -- before a brief burst of axe or screenshot work. Two workers
  // left the box mostly idle while 166 tests queued behind them.
  //
  // Measured on run 30965372151: 166 tests at ~11.5s each, 2 at a time = ~16 minutes, which
  // is arithmetic rather than slowness. Four workers halves the queue without oversubscribing
  // 4 vCPU, since the contended resource is latency, not CPU.
  //
  // Not higher than 4: past that we would be issuing enough concurrent requests at one preview
  // deployment to risk cold-start contention showing up as flake, and a flaky visual gate is
  // worse than a slow one.
  workers: process.env.CI ? 4 : undefined,
  retries: process.env.CI ? 2 : 0,
  // `shell-reporter.ts` rides along with every run, CI or local. It is the answer to the
  // ONE thing the list reporter cannot say: `12 skipped` next to `64 passed` reads as a pass,
  // and on #2048 those 12 were the entire member shell while the 64 were marketing pages with
  // no rail to photograph. The reporter names each unphotographed surface in
  // $GITHUB_STEP_SUMMARY (and in the terminal locally) so a green board and a green board with
  // the product missing stop looking identical. It never fails a run on its own; see its
  // header for the single opt-in exception (PW_REQUIRE_SHELL).
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['./test/e2e/shell-reporter.ts']]
    : [['list'], ['./test/e2e/shell-reporter.ts']],
  expect: {
    toHaveScreenshot: {
      // Deterministic captures: freeze animations, hide the caret, snapshot
      // at CSS pixel scale, and tolerate a small ABSOLUTE amount of pixel drift.
      //
      // 🔴 THIS WAS `maxDiffPixelRatio: 0.02` AND THAT NUMBER MADE THE GATE BLIND (LIVE-125,
      // ADR-1165). The intent -- "tolerate font and antialiasing noise" -- was right; a RATIO
      // was the wrong instrument, because these are FULL-PAGE captures of very tall pages and a
      // ratio scales with the canvas:
      //     /discover mobile   390 x 9675 = 3,773,250 px  ->  2% = 75,465 px allowed
      //     /discover desktop 1280 x 7538 = 9,648,640 px  ->  2% = 192,972 px allowed
      // A whole header control is 40 x 40 = 1,600 px, i.e. 2.1% of the mobile budget. So the gate
      // was blindest on exactly the content-rich pages that matter most, and it cost a real
      // change being marked broken, re-opened and re-closed (ADR-1161): `No baseline changes to
      // commit` reads as "nothing moved" but means "nothing moved by more than 2% of a
      // four-megapixel canvas". It is silent in BOTH directions -- `--update-snapshots` rewrites
      // a baseline only when the comparison FAILS, so a sub-threshold change is neither caught
      // NOR banked, and the baseline drifts further from reality with every one.
      //
      // THE FLOOR WAS MEASURED, NOT GUESSED, because a threshold set below real noise fails on
      // nothing and then gets routed around (ADR-970). Six consecutive captures of a 390x63392
      // and a 1280x29790 page -- text, gradients, shadows, rounded edges, a fresh browser
      // CONTEXT each time, which is what a CI re-run actually does -- differed by **0 pixels**,
      // every pair, both viewports. Chromium is deterministic within one pinned build, and CI
      // pins the build. The noise this tolerance exists for is CROSS-environment, not per-run.
      //
      // 400 sits far above that measured floor and far below the smallest thing the gate must
      // catch: a quarter of a 40 x 40 control, and 0.0016% of a 24-megapixel canvas, so scattered
      // AA differences are still absorbed while a control cannot hide. It does not grow with page
      // height, which is the whole point.
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixels: 400,
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
