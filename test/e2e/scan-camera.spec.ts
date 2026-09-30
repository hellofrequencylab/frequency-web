// The in-app scanner can open the camera on a phone (LIVE-713, ADR-1641).
//
// Until LIVE-713 every page was served `Permissions-Policy: camera=()`, which refuses getUserMedia
// for the page itself, so /scan (ADR-235: door check-in, Ghost Node, partner plaques) opened on its
// "The camera needs your permission" card in Chrome whatever the member had allowed. The fix has
// two halves and this spec drives both in a real browser, on the 390px `mobile` project:
//
//   1. THE HEADER. /scan is served `camera=(self)`, other pages keep `camera=()`, one line each.
//   2. THE DOCUMENT. A policy is fixed when a document loads, and a <Link> into /scan is a soft
//      navigation, so the scanner re-loads /scan as its own document when the one it mounted in
//      refuses the camera. The soft-navigation case drives that with the app router, the same
//      thing a <Link> calls.
//
// Chromium gets a fake camera (`--use-fake-device-for-media-stream`) and answers its own prompt
// (`--use-fake-ui-for-media-stream`), so "the viewfinder runs" is measurable in CI. Those flags do
// not override the Permissions-Policy header: under `camera=()` the fake camera is still refused,
// which is what makes the scanning line a measurement of the header and not of the flags.
import { existsSync } from 'node:fs'
import type { APIRequestContext } from '@playwright/test'
import { test, expect } from './fixtures'

const baseURL = process.env.PW_BASE_URL
const storageState = process.env.PW_STORAGE_STATE
const hasSession = !!storageState && existsSync(storageState)
// playwright.config.ts sets launchOptions only to point at the preinstalled Chromium here; a
// file-level launchOptions replaces that object, so it carries the same path.
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium'

test.use({
  launchOptions: {
    ...(existsSync(PREINSTALLED_CHROMIUM) ? { executablePath: PREINSTALLED_CHROMIUM } : {}),
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
  permissions: ['camera'],
})

const SCANNING = 'Point at the partner’s plaque or code.'
const DENIED = 'The camera needs your permission'

function mobileOnly(testInfo: { project: { name: string } }) {
  test.skip(testInfo.project.name !== 'mobile', 'The scanner is a phone surface; the 390px project drives it.')
}

// A cold preview can spend most of the 5 s default between a navigation and the scanner's first
// paint (LIVE-735). These are waits for the same thing, not a looser measurement of it.
const COLD_ROUTE = { timeout: 20_000 }

/**
 * The response THE APP serves at `path`, without following the app's own redirects (LIVE-735).
 *
 * playwright.config.ts sends `x-vercel-set-bypass-cookie: true` beside the bypass secret on a
 * protected preview, so the first request can be answered by Vercel with a redirect back to the SAME
 * URL that sets the cookie. That hop is the platform's, not the app's, and carries none of
 * next.config.ts's headers. /scan is the first path read, and at `maxRedirects: 0` it counted zero
 * Permissions-Policy lines on every protected preview (#3109, pr-compare run 36678631457). A redirect to
 * the same URL is followed; any other redirect (a signed-out /scan sent to /sign-in by proxy.ts)
 * is the app's answer for that path and is the response measured, exactly as before.
 */
async function appResponse(request: APIRequestContext, path: string) {
  const target = new URL(path, baseURL)
  const hops: string[] = []
  for (let i = 0; i < 3; i++) {
    const res = await request.get(path, { maxRedirects: 0 })
    const location = res.headers()['location']
    if (res.status() >= 300 && res.status() < 400 && location) {
      const to = new URL(location, target)
      if (to.origin === target.origin && to.pathname === target.pathname && to.search === target.search) {
        hops.push(`${res.status()} back to ${path}`)
        continue
      }
    }
    return { res, hops }
  }
  throw new Error(`${path} kept redirecting to itself (${hops.join(', ')}), so the app's response was never read`)
}

test.describe('the scanner can open the camera', { tag: ['@smoke'] }, () => {
  test.skip(!baseURL, 'PW_BASE_URL is required to read what the deployment serves.')

  test('/scan is served camera=(self) and other pages camera=(), one header each', async ({ page }, testInfo) => {
    mobileOnly(testInfo)
    for (const [path, camera] of [
      ['/scan', 'camera=(self)'],
      ['/', 'camera=()'],
      ['/sign-in', 'camera=()'],
    ] as const) {
      // No follow of the APP's redirects: a signed-out /scan answers a redirect, and that response
      // is the one this path serves. Only Vercel's same-URL cookie hop is stepped over.
      const { res, hops } = await appResponse(page.request, path)
      const seen = `${res.status()}${hops.length ? ` after ${hops.join(', ')}` : ''}`
      // On the record either way, so a green run still says which response it measured.
      console.log(`[scan-camera] ${path}: read ${seen}`)
      const lines = res.headersArray().filter((h) => h.name.toLowerCase() === 'permissions-policy')
      expect(lines, `${path} carries exactly one Permissions-Policy line (read ${seen})`).toHaveLength(1)
      const directives = lines[0].value.split(',').map((d) => d.trim())
      expect(directives, `${path} is served ${camera}`).toContain(camera)
      expect(directives, `${path} keeps the microphone off`).toContain('microphone=()')
      expect(directives, `${path} keeps geolocation on this origin`).toContain('geolocation=(self)')
    }
  })

  test.describe('signed in', () => {
    test.use({ storageState })
    test.skip(!hasSession, 'PW_STORAGE_STATE must point to a saved member session.')

    test('opened directly, /scan runs the viewfinder instead of the denied card', async ({ page }, testInfo) => {
      mobileOnly(testInfo)
      const response = await page.goto('/scan?hint=partner')
      expect(response?.ok(), `expected 2xx for /scan, got ${response?.status()}`).toBe(true)
      await expect(page.getByText(SCANNING)).toBeVisible(COLD_ROUTE)
      await expect
        .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState), COLD_ROUTE)
        .toBeGreaterThanOrEqual(2)
      await expect(page.getByText(DENIED)).toHaveCount(0)
    })

    test('reached by a soft navigation from a camera=() page, /scan re-loads as its own document and runs', async ({ page }, testInfo) => {
      mobileOnly(testInfo)
      const response = await page.goto('/settings')
      expect(response?.ok(), `expected 2xx for /settings, got ${response?.status()}`).toBe(true)
      // What a <Link href="/scan?hint=partner"> calls. window.next.router is the app router
      // instance Next exposes on every app page.
      await page.waitForFunction(() => !!(window as unknown as { next?: { router?: unknown } }).next?.router)
      // WAIT FOR THE RE-LOAD ITSELF (LIVE-735). The push fetches /scan's RSC payload (a fetch, not a
      // document request), mounts the scanner in the /settings document, and only then does the
      // scanner re-load /scan as its own document: two cold round trips to a preview before the
      // first scanning line can paint. Waiting 5 s from the push for the line was a race the
      // preview sometimes lost (e2e-manual smoke job 109734068949: "navigated to /scan?hint=partner",
      // then "element(s) not found"). The only DOCUMENT request for /scan in this test is the
      // scanner's own re-load, so it is awaited by name, and a scanner that never re-loads fails here.
      const reload = page.waitForResponse(
        (r) =>
          r.request().isNavigationRequest() &&
          r.frame() === page.mainFrame() &&
          new URL(r.url()).pathname === '/scan' &&
          // Vercel's same-URL cookie hop, if any, is not the document; the response it lands on is.
          !(r.status() >= 300 && r.status() < 400),
        COLD_ROUTE,
      )
      await page.evaluate(() =>
        (window as unknown as { next: { router: { push: (href: string) => void } } }).next.router.push('/scan?hint=partner'),
      )
      const reloaded = await reload
      expect(reloaded.ok(), `the scanner's re-load of /scan answered ${reloaded.status()}`).toBe(true)
      await page.waitForLoadState('domcontentloaded')
      await expect(page.getByText(SCANNING)).toBeVisible(COLD_ROUTE)
      await expect
        .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState), COLD_ROUTE)
        .toBeGreaterThanOrEqual(2)
      await expect(page.getByText(DENIED)).toHaveCount(0)
      // The document now running the scanner was loaded AT /scan, so its policy is /scan's.
      const loaded = await page.evaluate(() => new URL(performance.getEntriesByType('navigation')[0]?.name ?? '').pathname)
      expect(loaded).toBe('/scan')
    })
  })
})
