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

/**
 * THE SCREENSHOT TOLERANCE, AS AN ABSOLUTE PIXEL COUNT (LIVE-125, ADR-1258).
 *
 * It was `maxDiffPixelRatio: 0.02`, with the sound reason written beside it: tolerate font
 * and antialiasing drift. A RATIO scales with the canvas, and this suite takes FULL-PAGE
 * captures, so the tolerance grew with page height and the gate went blindest on exactly
 * the content-rich pages that carry the most. Measured on the COMMITTED baselines
 * (test/e2e/__screenshots__/visual.spec.ts), not on estimates:
 *
 *   pricing                desktop  1280 x 16110 = 20,620,800 px  ->  2% forgave 412,416 px
 *   how-to-build-community mobile    390 x 21777 =  8,493,030 px  ->  2% forgave 169,860 px
 *   discover               mobile    390 x  9541 =  3,720,990 px  ->  2% forgave  74,419 px
 *   app-space-console      mobile    390 x  2859 =  1,115,010 px  ->  2% forgave  22,300 px
 *   app-feed               mobile    390 x   844 =    329,160 px  ->  2% forgave   6,583 px
 *
 * One tolerance, a 62.6x spread in what it forgives, and the widest end is the one no
 * reviewer scrolls to. 412,416 pixels is 610 copies of the SMALLEST control this design
 * system draws (`--tap-min` dips to 26px in one preset, app/globals.css, so 26 x 26 = 676 px).
 *
 * WHY 400, from the arithmetic rather than a round guess. The value has to sit inside a
 * band with a measured floor and a measured ceiling:
 *   FLOOR  - the noise this tolerance exists for. Six consecutive full-page captures from
 *            FRESH browser contexts differed by 0 pixels (ADR-1165), and pr-compare then
 *            read 123 of 144 committed surfaces, up to 20.6 megapixels each, under 400
 *            against baselines captured on a DIFFERENT runner. 400 is the only value with
 *            a real cross-runner measurement behind it; anything lower is unmeasured.
 *   CEILING - 676 px, the smallest control the product draws. A budget at or above that
 *            lets a whole control appear, vanish or move with the gate reporting green.
 * 400 is 59% of that control, so a change touching more than three-fifths of the smallest
 * control on the page fails, on a 390 x 844 capture and a 1280 x 16110 one alike.
 *
 * WHAT IT STILL FORGIVES: `threshold` (Playwright's per-pixel colour delta) is untouched at
 * its default, so faint antialiasing shifts are not counted as differing pixels at all; 400
 * is the budget for pixels that clear it. WHAT IT NO LONGER FORGIVES: a header control, a
 * moved button, a changed icon, on any page of any height.
 *
 * NOT ZERO, deliberately. One Chromium patch bump that moves a subpixel would fail every
 * surface at once, and a gate that fails on nothing gets routed around (ADR-970).
 *
 * `test/e2e/screenshot-tolerance.test.ts` pins this arithmetic: it re-measures the forgiven
 * count on every committed baseline and fails if it varies with page height, or rises to
 * where a control can hide.
 */
export const SCREENSHOT_MAX_DIFF_PIXELS = 400;

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
      // Deterministic captures: freeze animations, hide the caret, snapshot at CSS pixel
      // scale, and tolerate a FIXED number of differing pixels (fonts/AA). The tolerance is
      // absolute on purpose and there is no ratio beside it: see SCREENSHOT_MAX_DIFF_PIXELS
      // above for the measurement, and for what a ratio cost this gate.
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixels: SCREENSHOT_MAX_DIFF_PIXELS,
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
    /**
     * THE NARROW PHONE (HYG-057, ADR-1270). 320 x 568 — iPhone SE 1st gen, and any phone at
     * large browser zoom.
     *
     * WHY A THIRD PROJECT. `overflow.spec.ts` has driven 320 / 360 / 390 since ADR-1035, but it
     * MEASURES boxes; nothing PHOTOGRAPHS the product at the narrow floor the contract commits
     * to. Three of ADR-1035's five defects first bite below 390, and the committed
     * `app-feed--dawn-light-mobile.png` shows the consequence of that gap directly: at 390 the
     * tab bar already renders `Communi…` and `The QuestMarketpL…`, frozen into the reference
     * because it was there when the reference was taken. A picture catches CHANGE, and there
     * was no picture at all below 390 to change.
     *
     * `testMatch` IS LOAD-BEARING AND IS NOT A GREP. The config header's warning is about
     * `grep`/`grepInvert`, which intersect with the CLI flags in package.json and can empty a
     * run; a per-project `testMatch` is a FILE filter that composes with them instead. Without
     * it a third project would triple `@smoke`, and — the expensive half — mint a third set of
     * `@a11y` contexts (`contextKey()` carries the project name) that nothing has ever
     * measured, so every one of them would be held to the zero default and fail on debt this
     * row did not create. `overflow.spec.ts` would collect here too and then skip itself, since
     * it already pins itself to `mobile` and drives its own widths.
     *
     * So this project photographs, and only photographs. `visual.spec.ts` narrows it further to
     * the surfaces where a narrow capture buys something the other two projects do not: the
     * member shell, and the header band. See the notes there.
     */
    {
      name: 'narrow',
      testMatch: '**/visual.spec.ts',
      use: {
        ...devices['iPhone 14'],
        browserName: 'chromium',
        defaultBrowserType: 'chromium',
        viewport: { width: 320, height: 568 },
        deviceScaleFactor: 1,
      },
    },
  ],
});
