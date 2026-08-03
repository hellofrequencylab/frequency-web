// Anonymous-reachable smoke checks. These hit a running deployment (Vercel
// preview or local dev server) via PW_BASE_URL — nothing is mocked. The whole
// file skips itself when PW_BASE_URL is unset so listing/CI collection never
// fails.
import { test, expect } from '@playwright/test';

const baseURL = process.env.PW_BASE_URL;

test.describe('smoke', { tag: '@smoke' }, () => {
  test.skip(
    !baseURL,
    'PW_BASE_URL is not set. Point it at a Vercel preview or a running dev server to run the smoke suite.',
  );

  test('home renders with an h1 and no console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    const response = await page.goto('/');
    expect(response, 'navigation to / returned a response').toBeTruthy();
    expect(response!.ok(), `expected 2xx for /, got ${response!.status()}`).toBe(true);

    await expect(page.locator('h1').first()).toBeVisible();

    // Ignore favicon fetch noise; everything else is a real regression signal.
    const relevant = consoleErrors.filter((text) => !text.includes('favicon'));
    expect(relevant, `console errors on /:\n${relevant.join('\n')}`).toEqual([]);
  });

  test('sign-in shows the sign-in affordance', async ({ page }) => {
    const response = await page.goto('/sign-in');
    expect(response!.ok(), `expected 2xx for /sign-in, got ${response!.status()}`).toBe(true);

    await expect(page.getByText(/sign in/i).first()).toBeVisible();
    await expect(
      page.locator('input[type="email"], input[name="email"], #email').first(),
    ).toBeVisible();
  });

  for (const path of ['/discover', '/pricing']) {
    test(`${path} renders`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response!.ok(), `expected 2xx for ${path}, got ${response!.status()}`).toBe(true);
      await expect(page.locator('h1, h2').first()).toBeVisible();
    });
  }

  test('events renders or redirects to sign-in (never a server error)', async ({ page }) => {
    // /events may be anonymous-visible or may bounce to /sign-in. Both are
    // fine — what we assert is that the redirect chain lands on a 2xx, i.e.
    // no 500 anywhere on the way.
    const response = await page.goto('/events');
    expect(
      response!.ok(),
      `expected the /events redirect chain to end in a 2xx, got ${response!.status()} at ${page.url()}`,
    ).toBe(true);

    const finalPath = new URL(page.url()).pathname;
    expect(
      finalPath.startsWith('/events') || finalPath.startsWith('/sign-in'),
      `expected to land on /events or /sign-in, landed on ${finalPath}`,
    ).toBe(true);
  });

  test('llms.txt returns text', async ({ request }) => {
    const response = await request.get('/llms.txt');
    expect(response.ok(), `expected 2xx for /llms.txt, got ${response.status()}`).toBe(true);
    expect(response.headers()['content-type'] ?? '').toContain('text');
    expect((await response.text()).trim().length).toBeGreaterThan(0);
  });

  test('robots.txt returns text', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.ok(), `expected 2xx for /robots.txt, got ${response.status()}`).toBe(true);
    expect(response.headers()['content-type'] ?? '').toContain('text');
    expect((await response.text()).trim().length).toBeGreaterThan(0);
  });
});
