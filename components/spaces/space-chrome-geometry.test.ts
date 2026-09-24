import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// ── ONE GEOMETRY SOURCE FOR THE SPACE HERO ────────────────────────────────────────────────────
//
// WHAT BROKE, so the next reader does not have to reconstruct it from assertions.
//
// `components/ui/button.tsx` BASE carries the `tap-target` utility — `min-block-size: var(--tap-min)`
// — and `--tap-min` is a VIEWER generation axis, not a Space one: 26px (bold) · 32px (balanced,
// the default) · 44px (classic) · 46px (playful) · 48px (spacious) · 46-56px (the three kids bands).
//
// The Space hero's on-cover chip was a HAND-ROLLED COPY of the button primitive's look. It carried
// the padding, the radius and the type scale, and it did not carry the floor. So the primary CTA,
// which composes the primitive, ROSE with the viewer's generation while the QR and Edit buttons
// beside it stayed pinned at their `h-9`. Measured deltas on the on-ink branch (the shipping
// default — ADR-526 makes every Space a Hero cover, and heroOnInk is true for every scrim but
// 'blend'):
//
//   bold      37.08 / 37.08   ✔        classic    44.00 / 39.24   +4.76
//   balanced  38.25 / 38.25   ✔        playful    46.00 / 38.52   +7.48
//                                      spacious   48.00 / 40.50   +7.50
//                                      kids-mid   50.00 / 40.32   +9.68
//                                      kids-early 56.00 / 41.40  +14.60
//
// SIX OF EIGHT generations rendered an uneven row, and the two that did not are the two densest —
// which is why it survived review: on a default profile the row is exactly even. The owner reported
// it as "make buttons all the same height".
//
// The MOBILE band was worse: its CTA had no explicit height at all, so it resolved to `--tap-min`
// against the glyph buttons' fixed 40px — a mismatch at EVERY generation, and the sign FLIPS
// (the CTA is 13px shorter at bold, 10px taller at kids-early).
//
// These are SOURCE assertions, in the house style of header-fit.test.ts: heights are a layout fact,
// this repo has no browser in `pnpm test`, and the honest thing a unit test can hold is the
// invariant that produced the layout. The invariant is "one geometry source", not "36px".

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

const LAYOUT = read('../../app/(main)/spaces/[slug]/(profile)/layout.tsx')
const BUTTON = read('../ui/button.tsx')
const MENU = read('./space-profile-menu.tsx')
const GLOBALS = read('../../app/globals.css')

describe('the button primitive exposes geometry without palette', () => {
  it('exports buttonGeometry', () => {
    expect(BUTTON).toMatch(/export function buttonGeometry\(/)
  })

  it('buttonGeometry carries the tap floor and no colour', () => {
    const body = BUTTON.slice(BUTTON.indexOf('export function buttonGeometry'))
    const fn = body.slice(0, body.indexOf('\n}') + 2)
    // It composes BASE (which owns `tap-target`) and a SIZE, and nothing else.
    expect(fn).toContain('BASE')
    expect(fn).toContain('SIZE[size]')
    expect(fn).not.toMatch(/VARIANT/)
  })

  it('BASE is what owns the tap floor, so every composer inherits it', () => {
    const start = BUTTON.indexOf('const BASE =')
    const end = BUTTON.indexOf('export function buttonGeometry')
    expect(start, 'BASE declaration not found').toBeGreaterThan(-1)
    expect(end, 'buttonGeometry not found after BASE').toBeGreaterThan(start)
    expect(BUTTON.slice(start, end)).toContain('tap-target')
  })
})

describe('every control in the Space hero shares that source', () => {
  it('the on-cover chip composes the primitive instead of hand-rolling it', () => {
    expect(LAYOUT).toMatch(/const onInkSecondaryClasses = buttonGeometry\(/)
  })

  // The exact string that used to stand here. Naming it is what stops a well-meaning
  // "restore the original look" from reintroducing the defect.
  it('does not re-declare the retired hand-rolled geometry', () => {
    expect(LAYOUT).not.toContain('SM_BUTTON_GEOMETRY')
    expect(LAYOUT).not.toMatch(/px-3 py-1\.5 text-body-sm font-semibold transition-colors'/)
  })

  it('the mobile glyph buttons carry the floor too', () => {
    const ghost = LAYOUT.slice(LAYOUT.indexOf('const ghostIconClasses'))
    expect(ghost.slice(0, 400)).toContain('tap-target')
  })

  it('the mobile CTA states a height, so it cannot be floored to a different one', () => {
    // Without `h-10` this resolved to --tap-min against the glyphs' fixed 40px.
    expect(LAYOUT).toMatch(/primaryCtaButton\(false\), 'h-10 min-w-0 flex-1'/)
  })

  it('the three desktop hero buttons all state the same resting height', () => {
    // h-9 sets the row's deliberate height; the shared floor raises all three together.
    expect((LAYOUT.match(/'h-9 shrink-0'/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect(LAYOUT).toMatch(/h-9 shrink-0 gap-1\.5/)
  })
})

describe('the tab bar rises with the viewer like the chrome around it', () => {
  // It sits between the hero (floored) and the tab body's buttons (floored) and was padding-only,
  // flat at ~31px. The presets that raise the floor exist for pointer accuracy, so the primary
  // navigation of a Space profile was opting out of the accommodation those viewers chose.
  it('the profile tab pills carry the tap floor', () => {
    expect(MENU).toMatch(/rounded-control px-3 py-1\.5 text-body-sm font-medium transition-colors tap-target/)
  })
})

describe('the tab bar is a scroller, not a squeeze', () => {
  // WHY `shrink-0` IS LOAD-BEARING, since the obvious reading says it is redundant.
  //
  // A flex child defaults to `flex-shrink: 1`, but it ALSO gets `min-width: auto`, which floors it at
  // its min-content width — and `whitespace-nowrap` makes min-content the whole label. A nowrap pill
  // is therefore normally self-protecting, and `shrink-0` really would be a no-op. Reproduced in
  // isolation it is: seven pills, no overlap, scroller intact.
  //
  // `tap-target` is what defeats that. It sets BOTH axes (app/globals.css):
  //     min-block-size: var(--tap-min);  min-inline-size: var(--tap-min);
  // and an explicit `min-inline-size` REPLACES `min-width: auto`, so the min-content floor is gone and
  // the pill may shrink to `--tap-min`. It was added to this row for VERTICAL rhythm (the describe
  // above); the horizontal floor came along silently and took the protection with it. Measured at the
  // default generation, 390px, seven tabs: pills collapse 65-98px → a uniform 56px, six of seven
  // labels overflow their own box (worst by 30px), rendering "CalendarCircles" / "DiscussReviews",
  // and the row FITS, so nothing scrolls and the tabs past the edge are unreachable.
  //
  // So the invariant is a COUPLING, not a lone class: while the pill carries `tap-target`, it must
  // carry `shrink-0` too. Both halves are asserted, and the globals.css side is read directly so that
  // removing `min-inline-size` there surfaces here rather than silently making this test pointless.
  it('the profile tab pills refuse to shrink', () => {
    expect(MENU).toMatch(/'shrink-0 whitespace-nowrap rounded-control/)
  })

  it('the pill that carries the tap floor carries the shrink floor with it', () => {
    const cls = MENU.slice(MENU.indexOf("'shrink-0 whitespace-nowrap"))
    const line = cls.slice(0, cls.indexOf('\n'))
    expect(line, 'tap-target and shrink-0 must stay on the same pill class').toContain('tap-target')
  })

  it('tap-target is still the thing that removes the min-content floor', () => {
    // If this ever stops being true, the coupling above is no longer required — but it must be a
    // deliberate edit, not a silent drift that leaves the comment above lying.
    const util = GLOBALS.slice(GLOBALS.indexOf('@utility tap-target'))
    expect(util.slice(0, util.indexOf('}'))).toContain('min-inline-size')
  })

  it('the row that holds them is still the scroller', () => {
    expect(MENU).toMatch(/overflow-x-auto overscroll-x-contain/)
  })

  // The owner's console entry carried `shrink-0` from the start; the tabs beside it did not. Both
  // must, or the bar is only half fixed.
  it('the Manage item keeps its own shrink floor', () => {
    expect(MENU).toMatch(/flex shrink-0 items-center gap-1 border-l/)
  })
})

describe('the Edit control says Edit', () => {
  it('drops the redundant "Space" from the label', () => {
    expect(LAYOUT).toMatch(/label=\{manage\.staffViewing \? 'Edit \(staff\)' : 'Edit'\}/)
    expect(LAYOUT).not.toContain("'Edit Space'")
  })
})
