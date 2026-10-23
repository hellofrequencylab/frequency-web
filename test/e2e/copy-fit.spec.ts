import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

import { assertNoServerErrors, assertNotProtectionWall } from './surfaces'

async function assertPublicTarget(page: Page, target: URL) {
  await assertNotProtectionWall(page)
  const finalUrl = new URL(page.url())
  expect(finalUrl.origin, 'Preview origin must survive navigation').toBe(target.origin)
  expect(finalUrl.pathname.replace(/\/$/, '') || '/', 'Requested route must survive navigation').toBe(target.pathname.replace(/\/$/, '') || '/')
  await expect(page.locator('[data-kit="site"]')).toBeVisible()
}

/** Runs in the page; classifications remain in the artifact for editorial review. */
function inspectCopyGeometry() {
  const root = document.querySelector('[data-kit="site"]') ?? document.querySelector('main') ?? document.body
  const screenReaderOnly = (el: Element) => {
    for (let parent: Element | null = el; parent; parent = parent.parentElement) {
      const s = getComputedStyle(parent)
      if (parent.classList.contains('sr-only') || parent.classList.contains('visually-hidden')) return true
      const r = parent.getBoundingClientRect()
      // The conventional offscreen accessible-label technique, not arbitrary small copy.
      if (['absolute', 'fixed'].includes(s.position) && r.width <= 1 && r.height <= 1 &&
        (s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)')) return true
    }
    return false
  }
  const visible = (el: Element) => {
    if (el.closest('[aria-hidden="true"], [inert]') || screenReaderOnly(el)) return false
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false
    for (let parent: Element | null = el; parent; parent = parent.parentElement) {
      const s = getComputedStyle(parent)
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false
    }
    return true
  }
  type Finding = { tag: string; text: string; reason: string }
  const clipped: Finding[] = []
  const intentionalTruncation: Finding[] = []
  const reachableScroll: Finding[] = []
  const repeatedTicker: Finding[] = []
  let accessibleOnlyTextNodes = 0
  const outside = (rects: DOMRect[], box: DOMRect, x: boolean, y: boolean) => rects.some(t =>
    (x && (t.left < box.left - 2 || t.right > box.right + 2)) ||
    (y && (t.top < box.top - 2 || t.bottom > box.bottom + 2)))
  // Existing kit teaser/detail cards only. A clamp added to a hero or CTA stays a failure.
  const teaserSelector = '.dx-tx b, .dx-tx em, .fqm-it .tx b, .fqm-it .tx em, .locpill span, .dx-clamp, .dd-clamp, .dx-post p, .fn-card .fn-desc, .nk-scr .r span, .nk-ev b, .nk-ev small, .pc-dock-pitch span'
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode
    const el = node.parentElement
    const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    if (!el || text.length < 3 || el.closest('script, style, svg, [role="tooltip"]')) continue
    if (screenReaderOnly(el)) { accessibleOnlyTextNodes++; continue }
    if (!visible(el)) continue
    const range = document.createRange()
    range.selectNodeContents(node)
    let rects = [...range.getClientRects()]
    const finding = (parent: Element, reason: string): Finding => ({
      tag: el.tagName, text: text.slice(0, 180), reason: `${reason}: ${parent.tagName}.${parent.className}`,
    })
    for (let parent: Element | null = el; parent && parent !== document.body; parent = parent.parentElement) {
      const s = getComputedStyle(parent)
      const box = parent.getBoundingClientRect()
      const scrollX = ['auto', 'scroll'].includes(s.overflowX) && parent.scrollWidth > parent.clientWidth
      const scrollY = ['auto', 'scroll'].includes(s.overflowY) && parent.scrollHeight > parent.clientHeight
      if ((scrollX || scrollY) && outside(rects, box, scrollX, scrollY)) {
        // Content outside an inner scrollport remains reachable. An inner malformed clip
        // would already have failed before reaching this ancestor.
        reachableScroll.push(finding(parent, 'Content reachable by scrolling'))
        break
      }
      const clipsX = ['hidden', 'clip'].includes(s.overflowX)
      const clipsY = ['hidden', 'clip'].includes(s.overflowY)
      if (!outside(rects, box, clipsX, clipsY)) continue
      const ticker = el.closest('.lv-track')
      const tickerLink = el.closest('a[href]')
      if (ticker && tickerLink && [...root.querySelectorAll('a[href]')].some(link =>
        !link.closest('.lv-track') && link.getAttribute('href') === tickerLink.getAttribute('href') && visible(link))) {
        repeatedTicker.push(finding(parent, 'Repeated ticker destination is available in the main list'))
        break
      }
      const clamp = Number.parseInt(s.webkitLineClamp, 10) > 0
      const ellipsis = s.textOverflow === 'ellipsis'
      const primaryCopy = !!el.closest('h1, h2, .ctas, button')
      if (parent.matches(teaserSelector) && (clamp || ellipsis) && !primaryCopy) {
        // Classify only this nearest intended teaser clip; continue checking outer ancestors.
        // A broken card or page clip cannot inherit the teaser's exemption.
        intentionalTruncation.push(finding(parent, 'Kit teaser truncation for manual review'))
        // Check only the painted fragment against outer boxes. The elided continuation is
        // retained in this report, but is not painted through a surrounding rounded card.
        rects = rects.map(t => {
          const left = clipsX ? Math.max(t.left, box.left) : t.left
          const top = clipsY ? Math.max(t.top, box.top) : t.top
          const right = clipsX ? Math.min(t.right, box.right) : t.right
          const bottom = clipsY ? Math.min(t.bottom, box.bottom) : t.bottom
          return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top))
        }).filter(t => t.width > 0 && t.height > 0)
        continue
      }
      clipped.push(finding(parent, 'Text exceeds clipping box'))
      break
    }
  }
  // Text ranges cannot detect a non-text callout wrapper or a rotated graphic box.
  // Keep a viewport geometry pass alongside text clipping, without allowing page clips.
  const boxesOutsideViewport: Finding[] = []
  for (const el of root.querySelectorAll('*')) {
    if (!visible(el) || el.closest('script, style, [role="tooltip"]')) continue
    const box = el.getBoundingClientRect()
    if (box.left >= -2 && box.right <= innerWidth + 2) continue
    let reachable = false
    for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const s = getComputedStyle(parent)
      if (['auto', 'scroll'].includes(s.overflowX) && parent.scrollWidth > parent.clientWidth) {
        reachable = true
        break
      }
    }
    if (reachable) continue
    boxesOutsideViewport.push({ tag: el.tagName, text: el.textContent?.trim().slice(0, 180) ?? '',
      reason: `Box outside viewport: ${el.className} (${Math.round(box.left)}→${Math.round(box.right)})` })
  }
  const hero = document.querySelector('main .hero, main .phero, #nk-hero, [data-screen-label="01 Hero"]')
  const primary = hero?.querySelector('.ctas a, .ctas button, a.btn, button[type="submit"]')
  return {
    url: location.href, width: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    overflow: document.documentElement.scrollWidth > innerWidth + 2,
    clipped, intentionalTruncation, reachableScroll, repeatedTicker, accessibleOnlyTextNodes, boxesOutsideViewport,
    primary: primary ? {
      text: primary.textContent?.trim(), visible: visible(primary),
      horizontallyReachable: primary.getBoundingClientRect().left >= -2 && primary.getBoundingClientRect().right <= innerWidth + 2,
      bounds: primary.getBoundingClientRect().toJSON(),
    } : null,
    h1: document.querySelector('h1')?.textContent?.trim(),
    description: document.querySelector('meta[name="description"]')?.getAttribute('content'),
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map(x => x.textContent),
  }
}

// Standalone, read-only public copy review. Run against an existing preview.
const base = process.env.PW_BASE_URL
const routes = (process.env.COPY_FIT_ROUTES ?? '/,/the-community,/spaces,/features,/pricing,/networks,/vision,/stories,/for,/for/coaches-and-healers,/for/studios,/for/event-hosts,/for/venues,/for/nonprofits,/for/networks,/discover,/discover/events,/discover/circles,/discover/spaces,/discover/topics,/discover/practices,/discover/journeys,/about,/friendship-as-an-adult,/how-to-start-a-circle,/how-to-build-community,/how-to-be-more-social,/loneliness,/mindless,/vs/partiful,/vs/eventbrite,/vs/mighty-networks,/vs/meetup,/vs/facebook-groups').split(',')
for (const width of [320, 390, 1280]) {
  for (const route of routes) {
    test(`@visual @copyfit ${width}px ${route}`, async ({ page, serverErrors }, info) => {
      test.skip(process.env.COPY_FIT_RUN !== '1' || info.project.name !== 'desktop', 'Explicit copy-fit run uses its own three viewport widths')
      test.skip(!base, 'PW_BASE_URL must point to an existing deployment')
      await page.setViewportSize({ width, height: width === 320 ? 568 : 844 })
      const target = new URL(route, base)
      const response = await page.goto(target.href, { waitUntil: 'domcontentloaded' })
      expect(response?.status(), 'Public route response').toBeLessThan(400)
      await assertPublicTarget(page, target)
      await page.evaluate(() => document.fonts.ready)
      await expect(page.locator('h1').first()).toBeVisible()
      expect(await page.title(), 'Document title').not.toMatch(/Authentication Required|Vercel Login/i)
      // Visit the entire page to let normal intersection reveals complete.
      const headings = page.locator('main h2, [data-kit="site"] h2')
      for (let i = 0; i < await headings.count(); i++) {
        const heading = headings.nth(i)
        if (await heading.isVisible()) await heading.scrollIntoViewIfNeeded()
      }
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(300)
      const report = await page.evaluate(inspectCopyGeometry)
      await info.attach('copy-fit-report', { body: JSON.stringify(report, null, 2), contentType: 'application/json' })
      await info.attach('full-page', { body: await page.screenshot({ fullPage: true, animations: 'disabled' }), contentType: 'image/png' })
      assertNoServerErrors(serverErrors, `${width}px ${route}`)
      expect(report.overflow, 'Horizontal document overflow').toBe(false)
      expect(report.clipped, 'Visible text clipped by an ancestor').toEqual([])
      expect(report.boxesOutsideViewport, 'Visible layout boxes fit the viewport').toEqual([])
      if (report.primary) {
        expect(report.primary.visible, 'Primary hero action is visible').toBe(true)
        expect(report.primary.horizontallyReachable, 'Primary hero action fits the viewport').toBe(true)
      }
    })
  }
}

// Local fixtures verify that a hidden tooltip cannot hide its off-screen callout wrapper,
// that real inner scrollers remain reachable, and that an auth page is never a public-page pass.
test('copy-fit detector rejects clipped callouts and wrong destinations @visual @copyfit', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'One deterministic fixture project is sufficient')
  await page.setViewportSize({ width: 320, height: 568 })
  const fixture = (body: string) => `<style>*{box-sizing:border-box}html,body{margin:0;width:320px}body{overflow-x:clip}</style><main data-kit="site" style="width:320px;overflow:clip">${body}</main>`
  await page.setContent(fixture('<div class="pm-float" style="margin-left:174px;width:152px;height:152px"><span style="display:block;width:152px;height:152px;border-radius:50%;background:blue"></span><span role="tooltip" style="display:none">Run every chapter as one organization</span></div>'))
  let report = await page.evaluate(inspectCopyGeometry)
  expect(report.clipped).toEqual([]) // No visible text range: the separate box gate must catch this.
  expect(report.boxesOutsideViewport.some(x => x.reason.includes('pm-float'))).toBe(true)
  await page.setContent(fixture('<div style="width:200px;overflow-x:auto"><div style="width:400px;height:40px">A reachable scrolling row with useful content.</div></div>'))
  report = await page.evaluate(inspectCopyGeometry)
  expect(report.boxesOutsideViewport).toEqual([])
  expect(report.clipped).toEqual([])
  await page.setContent(fixture('<div style="display:none;margin-left:300px;width:200px">Hidden content.</div>'))
  expect((await page.evaluate(inspectCopyGeometry)).boxesOutsideViewport).toEqual([])
  const authWall = { url: () => 'https://vercel.com/login', title: async () => 'Login – Vercel' } as unknown as Page
  await expect(assertPublicTarget(authWall, new URL('https://example.test/pricing'))).rejects.toThrow('Deployment Protection')
  const wrongRoute = { url: () => 'https://example.test/other', title: async () => 'Real page' } as unknown as Page
  await expect(assertPublicTarget(wrongRoute, new URL('https://example.test/pricing'))).rejects.toThrow()
  await page.setContent('<h1>Login – Vercel</h1>')
  await expect(assertPublicTarget(page, new URL(page.url()))).rejects.toThrow()
  await page.setContent(fixture('<h1>Plans and pricing</h1>'))
  await assertPublicTarget(page, new URL(page.url()))
})
