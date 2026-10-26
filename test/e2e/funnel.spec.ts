// The try-first funnel journey (SCAN-1136): the launch path an operator walks, from a door to the
// sign-in that precedes Create-a-Space and the offer. Anonymous and read-only, like smoke.spec.ts:
// it skips itself without PW_BASE_URL and mocks nothing.
//
// What it proves, and no more: every door renders with an h1 and offers a way in that leads to
// Create-a-Space or the join flow, and the two session routes send a signed-out visitor to /sign-in
// carrying `next`, so signing in lands them back where they were going. It does not sign in; the
// signed-in half of the funnel needs the minted session the shell suite uses.
import { test, expect } from './fixtures'
import { LAUNCH_DOOR_PATHS } from './surfaces'

const baseURL = process.env.PW_BASE_URL

test.describe('try-first funnel', { tag: '@smoke' }, () => {
  test.skip(!baseURL, 'PW_BASE_URL is not set. Point it at a Vercel preview or a running dev server to run the funnel journey.')

  for (const path of LAUNCH_DOOR_PATHS) {
    test(`${path} renders and offers a way in`, async ({ page }) => {
      const response = await page.goto(path)
      expect(response!.ok(), `expected 2xx for ${path}, got ${response!.status()}`).toBe(true)
      await expect(page.locator('h1').first()).toBeVisible()
      const ways = page.locator('a[href*="/spaces/new"], a[href*="/join"], a[href*="/sign-in"]')
      expect(await ways.count(), `${path} has no link into Create-a-Space, /join or /sign-in`).toBeGreaterThan(0)
    })
  }

  for (const route of ['/spaces/new', '/offer']) {
    test(`${route} sends a signed-out visitor to sign in and back`, async ({ page }) => {
      const response = await page.goto(route)
      expect(response!.ok(), `expected the ${route} redirect chain to end in a 2xx, got ${response!.status()} at ${page.url()}`).toBe(true)
      const url = new URL(page.url())
      expect(url.pathname, `${route} landed on ${url.pathname}`).toBe('/sign-in')
      expect(url.searchParams.get('next') ?? '', `${route} dropped its next`).toContain(route)
    })
  }
})
