// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DispatchTickerReserve, MobileGameStatsReserve } from './chrome-reserves'

// Two guards on the same defect from two angles: the CSS that stops a scroll lock from resizing the
// viewport, and the fallbacks that stop streamed chrome from appending instead of swapping.

const ROOT = process.cwd()
const GLOBALS = readFileSync(join(ROOT, 'app/globals.css'), 'utf8')

// THE GUTTER IS RESERVED ON THE ROOT SCROLLER, AND THIS BLOCK PINS THE DECLARATION (LIVE-479).
//
// `scrollbar-gutter: stable` on `html` is the answer to the reflow a scroll lock causes: the
// document scrolls, six overlays lock it with `overflow: hidden` on body and none compensates for
// the scrollbar, so without a reserved gutter every open deleted the root scrollbar and the sticky
// header and the rail column shifted by its width (the rail animating it). It was written and
// measured on the LIVE-477 branch, HELD BACK on 2026-09-23 because reserving the gutter narrows the
// content area on every page and moves every committed visual baseline, and shipped on 2026-09-28
// with that whole-repo recapture as its own change (LIVE-479).
//
// jsdom has no scrollbar, no layout and no `scrollbar-gutter`, so this can only assert the
// declaration is PRESENT on the root scroller; test/e2e/scroll-lock.spec.ts is the instrument that
// asserts it WORKS (document width, header width and rail edge unchanged across a real dialog open,
// past the rail's 200ms width transition). Two halves, and this is the half that runs on every PR.
describe('the scrollbar gutter is reserved on the root scroller', () => {
  it('ships `scrollbar-gutter: stable` on html, plain stable rather than both-edges', () => {
    // Anchored to the `html {` rule rather than anywhere in the file: a declaration on an inner
    // scroller would not stop the DOCUMENT scrollbar from being removed by the lock.
    const htmlRule = /html\s*\{[^}]*\}/.exec(GLOBALS)?.[0] ?? ''
    expect(htmlRule, 'no `html {` rule in app/globals.css').not.toBe('')
    expect(htmlRule).toMatch(/scrollbar-gutter:\s*stable\s*;/)
    expect(htmlRule).not.toMatch(/scrollbar-gutter:\s*stable\s+both-edges/)
    // And nowhere else in the file, so an inner scroller cannot pick it up by accident and inset
    // its own content against nothing.
    expect(GLOBALS.match(/scrollbar-gutter/g)?.length ?? 0, 'scrollbar-gutter is declared more than once').toBe(1)
  })

  it('says WHY at the site, so the next reader does not remove it blind', () => {
    expect(GLOBALS).toMatch(/SCROLLBAR GUTTER: RESERVED/)
    expect(GLOBALS).toMatch(/LIVE-479/)
  })

  it('still finds the scroll-lock sites, so the sweep cannot silently empty out', () => {
    const sites = ['components/ui/dialog.tsx', 'components/search/search-overlay.tsx']
    for (const site of sites) {
      const src = readFileSync(join(ROOT, site), 'utf8')
      expect(src, site).toMatch(/document\.body\.style\.overflow/)
    }
  })
})

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

/** A real reserved box names a height class; `h-0` is the defect this guards against. */
const HEIGHT_CLASS = /\bh-(\d+|px|full|screen|dvh|\[[^\]]+\])\b/

describe('every streamed chrome boundary reserves a real box', () => {
  it('the dispatch ticker reserve is exactly the bar it stands in for', () => {
    act(() => root.render(<DispatchTickerReserve />))
    const box = container.querySelector('[data-chrome-reserve="dispatch-ticker"]')!
    expect(box).toBeTruthy()
    expect(box.className).toMatch(HEIGHT_CLASS)
    expect(box.className).not.toMatch(/\bh-0\b/)

    // The bar's own height, read from the bar. If someone retunes the ticker and not the reserve,
    // this goes red instead of the top of every page jumping by the difference.
    const ticker = readFileSync(join(ROOT, 'components/layout/dispatch-ticker.tsx'), 'utf8')
    const bar = ticker.match(/className="sticky top-0[^"]*"/)
    expect(bar, 'the ticker still paints a sticky top bar').toBeTruthy()
    const barHeight = bar![0].match(HEIGHT_CLASS)![0]
    expect(box.className).toContain(barHeight)
    expect(bar![0]).toContain('border-b')
    expect(box.className).toContain('border-b')
  })

  it('the mobile Vault reserve is a real stack, not an empty div', () => {
    act(() => root.render(<MobileGameStatsReserve />))
    const box = container.querySelector('[data-chrome-reserve="mobile-game-stats"]')!
    expect(box).toBeTruthy()
    const children = [...box.children]
    expect(children.length).toBeGreaterThanOrEqual(3)
    for (const child of children) expect(child.className).toMatch(HEIGHT_CLASS)
  })

  it('both are aria-hidden: they are chrome holding a place, not content', () => {
    act(() => root.render(<><DispatchTickerReserve /><MobileGameStatsReserve /></>))
    for (const box of container.querySelectorAll('[data-chrome-reserve]')) {
      expect(box.getAttribute('aria-hidden')).toBe('true')
    }
  })
})

describe('the shell layout uses them', () => {
  const LAYOUT = readFileSync(join(ROOT, 'app/(main)/layout.tsx'), 'utf8')

  it('the ticker boundary reserves instead of falling back to null', () => {
    expect(LAYOUT).toMatch(/fallback=\{<DispatchTickerReserve \/>\}[\s\S]{0,120}DispatchTickerSlot/)
  })

  it('the mobile stats boundary reserves instead of falling back to null', () => {
    expect(LAYOUT).toMatch(/fallback=\{<MobileGameStatsReserve \/>\}[\s\S]{0,120}MobileGameStats/)
  })

  it('the Vault dock keeps fallback={null}, because a fixed box has no flow to reserve', () => {
    // Not an oversight and not an exception to be tidied away later: DockBar is
    // `fixed bottom-0 right-3`, so this boundary cannot move anything above or below it.
    expect(LAYOUT).toMatch(/fallback=\{null\}[\s\S]{0,120}VaultDockSlot/)
    expect(readFileSync(join(ROOT, 'components/layout/dock-bar.tsx'), 'utf8')).toContain('fixed bottom-0 right-3')
  })
})
