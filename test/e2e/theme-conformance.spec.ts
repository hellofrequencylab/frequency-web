import { test, expect } from './fixtures'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { conformanceMatrix, contrast, heightStability, reducedMotion, repaintBudget, resetTotal } from '../../lib/theme/conformance'

// THEME CONFORMANCE RUN (LIVE-2032, rules in docs/design-systems/services/rules.json). LIVE-1998 shipped the ten checks
// as pure functions; this spec collects their data from a RENDERED theme and feeds every case of conformanceMatrix() to
// them. It needs a page that carries the theme's root attributes, from either source:
//
//   CONFORMANCE_FIXTURE=<file.html>   a static render (scripts/render/builder-roles-themes.render.tsx writes one per theme)
//   CONFORMANCE_URL=<url>             a themed page: a published Space site whose theme is the one under test
//
// With neither set the spec skips itself, like every other spec here. CONFORMANCE_THEME names the theme (default
// `services`, the first to declare dials); its root is `[data-house-theme="<theme>"]`.
//
// COVERED HERE: contrast (1), type-height-stability (3), reduced-motion (5), reset-total (8), repaint-budget (10).
// NOT COVERED, because they need what a static render cannot give: motion-additive (4) and empty-states (6) need a live
// Space with and without content, hidden-functions (7) and surface-parity (9) need the editor's hide toggles and the
// profile, Spotlight and email renders; no-literal-colours (2) is source analysis (block-contract-tokens.test.ts).

const THEME = process.env.CONFORMANCE_THEME ?? 'services'
const FIXTURE = process.env.CONFORMANCE_FIXTURE
const URL_UNDER_TEST = process.env.CONFORMANCE_URL
const target = FIXTURE ? pathToFileURL(resolve(FIXTURE)).href : URL_UNDER_TEST
const ROOT = `[data-house-theme="${THEME}"]`

// The dials a render reads, as the root attributes site-chrome.tsx sets. Register is `data-th`; Night is the absence of it.
const ATTR: Record<string, string> = { register: 'data-th', type: 'data-type', motion: 'data-motion', image: 'data-image' }

// Resolved to #rrggbb by painting on a canvas, because computed colours may come back as rgb(), oklab() or color(srgb ...).
const COLOURS = `(() => {
  const root = document.querySelector(${JSON.stringify(ROOT)})
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  const hex = (token) => {
    const probe = document.createElement('span')
    probe.style.color = 'var(' + token + ')'
    root.appendChild(probe)
    const css = getComputedStyle(probe).color
    probe.remove()
    ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
  }
  return { bg: hex('--c-canvas'), text: hex('--c-text'), accent: hex('--c-accent'), accentText: hex('--c-accent-text'), onAccent: hex('--c-on-accent') }
})()`

test.describe(`theme conformance: ${THEME}`, () => {
  test.skip(!target, 'Set CONFORMANCE_FIXTURE (a static render) or CONFORMANCE_URL (a themed page) to run the conformance matrix.')

  async function open(page: import('@playwright/test').Page, width: number) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(target!)
    await expect(page.locator(ROOT).first()).toBeVisible()
  }
  const setDials = (page: import('@playwright/test').Page, dials: Record<string, string>) =>
    page.evaluate(({ root, dials, attr }) => {
      const el = document.querySelector(root)!
      for (const [k, v] of Object.entries(dials)) {
        const a = attr[k]
        if (!a) continue
        if (k === 'register' && v === 'night') el.removeAttribute(a)
        else el.setAttribute(a, v)
      }
    }, { root: ROOT, dials, attr: ATTR })

  test('contrast holds in every register and type voice', async ({ page }) => {
    await open(page, 1440)
    const matrix = conformanceMatrix(['default'])
    const seen = new Set<string>()
    const failures: string[] = []
    for (const c of matrix) {
      const key = `${c.register}/${c.type}`
      if (seen.has(key)) continue
      seen.add(key)
      await setDials(page, { register: c.register, type: c.type })
      failures.push(...contrast(await page.evaluate(COLOURS) as Parameters<typeof contrast>[0], key))
    }
    expect(failures).toEqual([])
  })

  test('no block moves more than 8% between type voices, at 1440 and 390', async ({ page }) => {
    const failures: string[] = []
    for (const width of [1440, 390]) {
      await open(page, width)
      const heights: Record<string, Record<string, number>> = {}
      for (const type of [...new Set(conformanceMatrix(['default']).map((c) => c.type))]) {
        await setDials(page, { type })
        const rows = await page.evaluate((root) => [...document.querySelectorAll(`${root} [data-role]`)].map((e, i) => [`${e.getAttribute('data-role')}#${i}`, e.getBoundingClientRect().height] as const), ROOT)
        for (const [block, h] of rows) (heights[block] ??= {})[type] = h
      }
      failures.push(...heightStability(heights, `${width}px`))
    }
    expect(failures).toEqual([])
    // A stable height proves nothing if the dial draws nothing. Record it when no block's title face follows the voice.
    await open(page, 1440)
    const faces = new Set<string>()
    for (const type of new Set(conformanceMatrix(['default']).map((c) => c.type))) {
      await setDials(page, { type })
      faces.add(await page.evaluate((root) => getComputedStyle(document.querySelector(`${root} [data-part="title"]`)!).fontFamily, ROOT))
    }
    if (faces.size < 2) test.info().annotations.push({ type: 'inert-dial', description: 'The type dial changes no block title face in this render, so the height check passed without a voice to test.' })
  })

  test('reduced motion stops every animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, 1440)
    await setDials(page, { motion: 'full' })
    const effects = await page.evaluate((root) => [...document.querySelectorAll(`${root} *`)].filter((e) => e.getAnimations().length > 0).map((e, i) => ({ id: `${e.getAttribute('data-role') ?? e.tagName}#${i}`, animating: e.getAnimations().some((a) => a.playState === 'running') })), ROOT)
    expect(reducedMotion(effects)).toEqual([])
  })

  test('removing every dial returns the render to its own look', async ({ page }) => {
    await open(page, 1440)
    const read = () => page.evaluate((root) => { const el = document.querySelector(root)!; return Object.fromEntries(['data-th', 'data-type', 'data-motion', 'data-image'].map((a) => [a, el.getAttribute(a) ?? ''])) }, ROOT)
    const own = await read()
    await setDials(page, { register: 'day', type: 'editorial', motion: 'full', image: 'mono' })
    await page.evaluate((root) => { const el = document.querySelector(root)!; for (const a of ['data-th', 'data-type', 'data-motion', 'data-image']) el.removeAttribute(a) }, ROOT)
    // A render with no attribute set is its own default; set back what it began with and compare.
    await page.evaluate(({ root, own }) => { const el = document.querySelector(root)!; for (const [a, v] of Object.entries(own)) if (v) el.setAttribute(a, v) }, { root: ROOT, own })
    expect(resetTotal(own, await read())).toEqual([])
  })

  test('a dial change repaints inside the 100ms budget', async ({ page }) => {
    await open(page, 1440)
    const ms = await page.evaluate(async (root) => {
      const el = document.querySelector(root)!
      const t = performance.now()
      el.setAttribute('data-th', 'day')
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      return performance.now() - t
    }, ROOT)
    expect(repaintBudget(ms, false, 'register')).toEqual([])
  })
})
