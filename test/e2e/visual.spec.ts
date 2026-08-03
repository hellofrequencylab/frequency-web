// Visual snapshots of the key anonymous surfaces, at both viewports
// (see the `desktop` and `mobile` projects in playwright.config.ts).
//
// Tagged @visual so they only run when explicitly asked for:
//   pnpm test:e2e:visual        (playwright test --grep @visual)
// The plain smoke run (pnpm test:e2e) grep-inverts the tag, so these never
// fire by accident.
//
// Baselines are generated on the first --update-snapshots run:
//   PW_BASE_URL=<url> pnpm test:e2e:update
// They land in test/e2e/__screenshots__/ and should be committed. Until that
// first run exists, `pnpm test:e2e:visual` fails with "snapshot doesn't
// exist" — that is expected, not a bug.
import { test, expect } from '@playwright/test';

const baseURL = process.env.PW_BASE_URL;

const SURFACES = ['/', '/pricing', '/discover', '/the-community', '/about'];

function slug(path: string): string {
  return path === '/' ? 'home' : path.replace(/^\//, '').replace(/\//g, '-');
}

test.describe('visual', { tag: '@visual' }, () => {
  test.skip(
    !baseURL,
    'PW_BASE_URL is not set. Point it at a Vercel preview or a running dev server to run the visual suite.',
  );

  for (const path of SURFACES) {
    test(`${path} matches baseline`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });
      // Web fonts swap late and shift text metrics; wait them out.
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`${slug(path)}.png`, {
        fullPage: true,
      });
    });
  }
});
