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

// THE GUTTER IS NOT HERE YET, AND THIS BLOCK GUARDS THE HOLD RATHER THAN THE FIX (LIVE-479).
//
// `scrollbar-gutter: stable` on `html` is the right answer to the reflow a scroll lock causes, and
// it was written, measured and then HELD BACK: reserving the gutter narrows the content area on
// every page, so it legitimately moves every committed visual baseline (`/discover` came back
// 259,977 pixels different on a PR touching nothing it renders). A whole-repo recapture is honest
// work, but it is its own change with its own reading, so it rides LIVE-479 rather than a blink fix.
//
// So this asserts the hold is DELIBERATE and still explained. The day LIVE-479 lands, this block
// flips back to asserting the declaration exists, which is a two-line edit and the comment in
// app/globals.css says so at the site.
describe('the scrollbar gutter is held back, on purpose and in writing', () => {
  it('does not ship the declaration yet', () => {
    expect(GLOBALS).not.toMatch(/scrollbar-gutter:\s*stable\s*;/)
  })

  it('says WHY at the site, so the next reader does not add it back blind', () => {
    expect(GLOBALS).toMatch(/SCROLLBAR GUTTER: HELD BACK ON PURPOSE/)
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
