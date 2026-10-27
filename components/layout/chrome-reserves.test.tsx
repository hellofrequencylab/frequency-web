// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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
