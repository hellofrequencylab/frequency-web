// Horizontal-overflow gate — "does any page run off the side of a phone?"
//
// ── WHY THIS EXISTS, AND WHY THE SUITES ALREADY HERE COULD NOT CATCH IT ───────────────────────
//
// ADR-1035: a wordmark asset was re-cropped, every header that sizes it by height silently grew
// ~50px, and the marketing menu button — the only navigation a signed-out visitor has below `md`
// — ended up at x=404 on a 360px screen. It was not clipped, it was OFF THE SCREEN: the bar is
// `fixed`, the document does not scroll sideways, and the shell root carries `overflow-x-clip`.
// That combination is the whole problem in one line — **this product hides its own overflow**.
// Nothing scrolls, nothing errors, nothing logs. The UI is simply amputated.
//
// Neither existing suite could see it:
//
//   @a11y    axe has no rule for "off the viewport". The button had a fine name and role.
//   @visual  full-page baselines ~18,000px tall against `maxDiffPixelRatio: 0.02`. A 64px header
//            is ~0.35% of that image, so the chrome at the top of every page can change
//            COMPLETELY and still pass. Measured, not assumed: the ADR-1035 fix moved the header
//            on every marketing page and the tab bar on every shell page, and the only baselines
//            that failed were four `/pricing` mobile ones — those only because a 368px body
//            reflow reached 7%.
//
// So the gate is a MEASUREMENT, not a picture: walk the DOM and assert every painted box sits
// inside the viewport. It is cheap (no baseline, no artifact) and it fails with a selector and a
// pixel count, which is what a CI log needs to be actionable on its own.
//
// ── THE WIDTHS, AND WHY 390 ALONE WAS NOT ENOUGH ──────────────────────────────────────────────
//
// The `mobile` Playwright project is 390px (iPhone 14). Three of ADR-1035's five defects first
// bite BELOW that — the tab bar's seven min-content tabs summed to 319px against a 320px screen.
// A gate that only ever looks at the widest common phone is a gate that meets the bug last. So
// this spec drives its own widths and does not inherit the project's.
//
// 320  the narrow floor (iPhone SE 1st gen, and any phone at large browser zoom)
// 360  the most common Android width
// 390  the project width, kept so a failure here and a visual diff line up
//
// ── WHAT COUNTS AS OVERFLOW, AND THE THREE THINGS THAT DO NOT ─────────────────────────────────
//
// A box fails when its right edge is past the viewport or its left edge is before 0. Three
// exemptions, each for a real pattern rather than to quiet a failure:
//
//   1. Anything inside a container that scrolls on purpose (`overflow-x: auto|scroll`). Wide
//      tables and the admin sub-nav are SUPPOSED to overrun their box — PAGE-FRAMEWORK's rule is
//      that they scroll inside their own container, and that is exactly what this walks past.
//   2. Anything inside a clipping container (`overflow: hidden|clip`) that is ITSELF in bounds.
//      The marquee is 3,600px wide by design inside an `overflow-hidden` strip; so are carousels
//      and the off-canvas drawer, which parks at `-translate-x-full`.
//   3. Boxes the layout has deliberately pushed off-stage: `visibility: hidden`, zero-size, and
//      `aria-hidden` decorative bleeds.
//
// Only the OUTERMOST offender in a subtree is reported. One overflowing card otherwise names
// every descendant it drags with it, and the fix is always on the ancestor.

import { expect, test, type Page } from '@playwright/test'

import {
  applyRenderState,
  appSurfaces,
  assertMemberSession,
  assertNotProtectionWall,
  currentPathname,
  publicSurfaces,
  RENDER_STATES,
  settle,
  STORAGE_STATE,
  type Surface,
} from './surfaces'

const baseURL = process.env.PW_BASE_URL

/** The phone widths this gate drives itself. See the note above on why 390 alone is not enough. */
const WIDTHS = [320, 360, 390] as const

/** One offending box, shaped for a CI log rather than for a report artifact. */
type Offender = {
  tag: string
  cls: string
  id: string | null
  text: string
  left: number
  right: number
  width: number
  over: number
}

/**
 * Every box that leaves the viewport horizontally, outermost-first.
 *
 * Runs entirely in the page so it costs one round trip rather than one per element — a feed page
 * carries several thousand nodes and a per-node `boundingBox()` call would dominate the run.
 */
async function overflowing(page: Page, viewport: number): Promise<Offender[]> {
  return page.evaluate((vw) => {
    const out: Offender[] = []

    /** Is `el` inside something that scrolls or clips on purpose, and is that ancestor in bounds? */
    const excusedByAncestor = (el: Element): boolean => {
      let node = el.parentElement
      while (node && node !== document.documentElement) {
        const s = getComputedStyle(node)
        const x = s.overflowX
        const y = s.overflowY
        if (x === 'auto' || x === 'scroll' || y === 'auto' || y === 'scroll') return true
        if (x === 'hidden' || x === 'clip' || y === 'hidden' || y === 'clip') {
          // A clip only excuses the child if the CLIPPER itself is on screen. The shell root
          // carries `overflow-x-clip`, so without this the gate would excuse the entire app.
          const r = node.getBoundingClientRect()
          if (r.right <= vw + 1 && r.left >= -1) return true
        }
        node = node.parentElement
      }
      return false
    }

    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue

      const s = getComputedStyle(el)
      if (s.visibility === 'hidden' || s.display === 'none') continue
      // Decorative bleeds (glows, rules, gradient washes) are allowed to run past the edge.
      if (el.getAttribute('aria-hidden') === 'true') continue

      const over = Math.max(rect.right - vw, -rect.left)
      if (over <= 1) continue
      if (excusedByAncestor(el)) continue

      // Outermost only: if the parent is already over by as much, this box is a passenger.
      const parent = el.parentElement?.getBoundingClientRect()
      const parentOver = parent ? Math.max(parent.right - vw, -parent.left) : 0
      if (over - parentOver <= 1) continue

      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute('class') ?? '').slice(0, 160),
        id: el.id || null,
        text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        over: Math.round(over),
      })
    }
    return out
  }, viewport)
}

/** The failure message. Names each box so the fix is possible from the CI log alone.
 *  Returns '' on the passing path — `expect` never renders a message for a pass. */
function report(surface: Surface, width: number, found: Offender[]): string {
  if (found.length === 0) return ''
  const lines = found.map(
    (o) =>
      `  · <${o.tag}${o.id ? ` id="${o.id}"` : ''}> runs ${o.over}px past the ${width}px viewport ` +
      `(x ${o.left}→${o.right}, width ${o.width})\n` +
      `      class: ${o.cls || '(none)'}\n` +
      (o.text ? `      text:  "${o.text}"\n` : ''),
  )
  return (
    `${surface.path} overflows a ${width}px viewport (${found.length} box${found.length === 1 ? '' : 'es'}).\n` +
    `${lines.join('')}\n` +
    `  The shell root carries overflow-x-clip, so this does NOT scroll — it is cut off and\n` +
    `  unreachable on a phone. Usual cause: a flex child that cannot shrink (min-width:auto is\n` +
    `  the real floor, so add min-w-0) or a shrink-0 sibling that should not be pinned.\n` +
    `  See ADR-1035 and components/layout/header-fit.test.ts.`
  )
}

async function check(page: Page, surface: Surface, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 844 })
  await page.goto(surface.path, { waitUntil: 'load' })
  await assertNotProtectionWall(page)
  await assertMemberSession(page, surface)

  const landed = currentPathname(page)
  if (surface.audience === 'anon' && landed.startsWith('/sign-in') && surface.path !== '/sign-in') {
    test.skip(true, `${surface.path} redirects anonymous visitors to /sign-in.`)
  }

  await settle(page)
  const found = await overflowing(page, width)
  // Asserted on the COUNT, not on the array. `toEqual([])` prints every offender twice — once in
  // the readable report and again as a 20-line object diff — and the diff is the half nobody can
  // act on. The message carries the detail; the assertion just has to fail.
  expect(found.length === 0, report(surface, width, found)).toBe(true)
}

test.describe('overflow', { tag: '@overflow' }, () => {
  test.skip(
    !baseURL,
    'PW_BASE_URL is not set. Point it at a Vercel preview or a running dev server to run the overflow gate.',
  )

  // ONE project. This spec drives its own viewport widths (see WIDTHS above), so running it under
  // both `desktop` and `mobile` would measure the identical boxes twice and double the wall time
  // for no second answer. It rides `mobile` because that is where a failure is read.
  test.skip(
    ({ }) => test.info().project.name !== 'mobile',
    'The overflow gate sets its own widths; it runs once, under the mobile project.',
  )

  // ONE render state. Overflow is a LAYOUT fact: the mode and skin axes re-map colour tokens, not
  // box widths, so running four states would quadruple the wall time to re-measure the same boxes.
  // (The type axis DOES move widths — but it rides `data-generation`, which is orthogonal to the
  // render states here and is pinned browserlessly instead.)
  const state = RENDER_STATES[0]!

  for (const surface of publicSurfaces()) {
    for (const width of WIDTHS) {
      test(`${surface.path} fits ${width}px @overflow`, async ({ page }) => {
        await applyRenderState(page, state)
        await check(page, surface, width)
      })
    }
  }

  // The member shell — the surfaces with a rail, a dock and the bottom tab bar, i.e. the ones
  // ADR-1035's in-app defects lived on. They need PW_STORAGE_STATE; without it they skip, and the
  // shell reporter names them as uncovered rather than letting a green board imply coverage.
  test.describe('shell', { tag: '@shell' }, () => {
    test.skip(!STORAGE_STATE, 'PW_STORAGE_STATE is not set; the member shell cannot be reached.')
    for (const surface of appSurfaces()) {
      for (const width of WIDTHS) {
        test(`${surface.path} fits ${width}px @overflow`, async ({ page }) => {
          await applyRenderState(page, state)
          await check(page, surface, width)
        })
      }
    }
  })
})
