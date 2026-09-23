// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Two guards on the same defect from two angles: the CSS that stops a scroll lock from resizing the
// viewport, and the fallbacks that stop streamed chrome from appending instead of swapping.

const ROOT = process.cwd()
const GLOBALS = readFileSync(join(ROOT, 'app/globals.css'), 'utf8')

/** The `html { … }` rule in app/globals.css (the Base block), declarations only. */
function htmlRule(): string {
  const m = GLOBALS.match(/\nhtml\s*\{([\s\S]*?)\n\}/)
  expect(m, 'app/globals.css has an `html { … }` rule').toBeTruthy()
  return m![1]!
}

describe('the root scroller always reserves its scrollbar', () => {
  // ── WHY ────────────────────────────────────────────────────────────────────────────────────
  // The DOCUMENT is what scrolls in the authed shell (components/layout/app-shell.tsx: "The
  // document itself scrolls (not an inner pane)"), and the header and both rails ride it via
  // `sticky`. Every overlay in this repo locks that scroll with
  // `document.body.style.overflow = 'hidden'` and none of them compensates for the scrollbar. With
  // no gutter reserved, locking DELETES the scrollbar and unlocking puts it back, so the viewport
  // grows and shrinks by its width on every open and close — and the sticky full-width header and
  // the `shrink-0` right-rail column move with it. The rail column carries
  // `transition-[width] duration-200`, so it ANIMATES that shift rather than jumping it.
  //
  // One line on `html` fixes all of them at once. Per-dialog padding compensation does not: it has
  // to be repeated at every lock site, and padding on <body> does not move a `position: sticky`
  // child, which is laid out against the viewport.

  it('sets scrollbar-gutter: stable on html', () => {
    expect(htmlRule()).toMatch(/scrollbar-gutter:\s*stable\s*;/)
  })

  it('does not use both-edges, which would inset the whole page against nothing', () => {
    // `both-edges` mirrors the reserve onto the inline-start side too. In this LTR layout that is a
    // scrollbar width of empty gutter down the left of every page, permanently.
    expect(htmlRule()).not.toMatch(/scrollbar-gutter:[^;]*both-edges/)
  })

  it('leaves inner scrollers alone (the admin sub-nav keeps its hidden bar)', () => {
    // The gutter is declared on `html` and nowhere else, so it governs the ROOT scroller only.
    expect(GLOBALS.match(/scrollbar-gutter/g)).toHaveLength(1)
    expect(GLOBALS).toContain('scrollbar-width: none') // .admin-subnav-scroll, untouched
  })

  it('finds the scroll-lock sites at all (guards against a silently-empty sweep)', () => {
    // If this ever drops to zero the guard above is protecting nothing and should be re-argued,
    // not deleted.
    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '.next') continue
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (full.endsWith('.tsx')) files.push(full)
      }
    }
    walk(join(ROOT, 'components'))
    const lockers = files.filter((f) => /body\.style\.overflow\s*=\s*'hidden'/.test(readFileSync(f, 'utf8')))
    expect(lockers.length).toBeGreaterThanOrEqual(5)
  })
})

// ── The reserved boxes ───────────────────────────────────────────────────────────────────────

const { DispatchTickerReserve, MobileGameStatsReserve } = await import('./chrome-reserves')

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

/** Tailwind is not compiled here, so height is asserted on the class that sets it — which is also
 *  the thing that can silently change. `h-0` / no height class is the failure being guarded. */
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
