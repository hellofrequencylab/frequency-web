import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { CTA_LABEL_COMPACT } from '@/lib/site'

// ── THE HEADER FIT CONTRACT ──────────────────────────────────────────────────────────────────
//
// WHAT BROKE, so the next reader knows what this guards rather than guessing from assertions.
//
// The wordmark asset was re-cropped from 963x170 to 963x130 (#2085, 2026-08-11) to cut the retired
// tagline out of its pixels. That was correct and the crop is provable. What nobody measured is
// that the mark is sized by HEIGHT everywhere — `h-7 w-auto`, `h-[22px]` + `aspect-ratio` — so a
// 31% narrower asset is a 31% WIDER mark at the same CSS height. 963/170 = 5.66:1 became
// 963/130 = 7.41:1, and every header that leads with it silently gained ~50px:
//
//   MarketingHeader / SiteHeader  h-7  →  168px became 220px
//   AppShell (BrandMark)          22px →  124px became 163px
//
// Each of those bars was laid out as ARITHMETIC — a `shrink-0` mark plus fixed-size controls that
// happened to add up on a phone. Arithmetic cannot notice an asset swap. Nothing threw, no test
// failed, and the result on a 360px Android was:
//
//   • the marketing header's mobile menu button sat at x=404 on a 360px screen. The bar is
//     `fixed` and the document does not scroll sideways, so the ONLY navigation a signed-out
//     visitor has on a marketing page was not merely clipped, it was unreachable.
//   • /discover's "Sign in + Start a Circle" cluster ran to x=496.
//   • the in-app header's icon cluster is `justify-end`, so being squeezed pushed its icons out
//     through its LEFT edge, painting the search glyph on top of the wordmark.
//
// THE FIX IS STRUCTURAL, AND THAT IS WHAT THIS FILE PINS. Each of these bars now has exactly ONE
// child that may shrink — the wordmark — and every control is `shrink-0`. A layout with a single
// designated give-way point cannot be broken by an asset swap, a longer CTA label or a denser
// generation preset: the mark gets smaller and nothing leaves the screen. A layout that adds up
// can be broken by any of the three, silently, on the surface with the least test coverage.
//
// ⚠️ READ §THE PHONE LABEL BUDGET AT THE FOOT OF THIS FILE BEFORE TRUSTING THE SENTENCE ABOVE.
// "a longer CTA label" is only covered while a give-way child still has width left to give, and on
// SiteHeader below `sm` it does not. That is a real hole, it was found the expensive way, and the
// budget down there is the half of this contract the structure cannot express.
//
// These are SOURCE assertions on purpose. The failure is a layout fact and this repo has no
// browser in `pnpm test`; the honest thing a unit test can hold is the invariant that produced the
// layout, not a screenshot of it. The pixel half is the e2e a11y/visual suite's job.

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

const MARKETING = read('./marketing-header.tsx')
const SITE = read('./site-header.tsx')
const SHELL = read('./app-shell.tsx')
const BRAND = read('./brand-mark.tsx')
const MOBILE_MENU = read('./marketing-mobile-menu.tsx')
const USER_MENU = read('./user-menu.tsx')

/** The wordmark's aspect after the crop. Stated here so the arithmetic above is checkable and so a
 *  future swap has a number to disagree with rather than a paragraph to skim. */
const WORDMARK_ASPECT = 963 / 130

describe('the wordmark is sized by height, so its width is a derived number', () => {
  it('is the aspect app/globals.css masks with', () => {
    expect(read('../../app/globals.css')).toContain('aspect-ratio: 963 / 130')
  })

  it('is wide enough that a header cannot afford to treat it as fixed', () => {
    // 22px is the in-app header's mobile mark; 28px (h-7) the public one. Both eat a large
    // fraction of a 360px phone, which is why they must be the child that gives way.
    expect(Math.round(22 * WORDMARK_ASPECT)).toBe(163)
    expect(Math.round(28 * WORDMARK_ASPECT)).toBe(207)
  })
})

describe('MarketingHeader: the wordmark is the only child that may shrink', () => {
  it('gives the wordmark link a shrinkable box', () => {
    expect(MARKETING).toContain('className="min-w-0 shrink"')
  })

  it('lets the mark scale down instead of squashing, once its box narrows', () => {
    expect(MARKETING).toMatch(/<Wordmark className=\{`h-6 w-auto max-w-full object-contain sm:h-7/)
  })

  it('pins the CTA — the conversion control must never be clipped', () => {
    expect(MARKETING).toMatch(/shrink-0 rounded-lg px-3 py-1\.5 text-body-sm font-bold[^`]*whitespace-nowrap/)
  })

  it('pins Sign in', () => {
    expect(MARKETING).toContain('hidden shrink-0 sm:block')
  })
})

describe('SiteHeader (/discover and the public shells): the same one contract', () => {
  it('gives both wordmark links — client-auth and server-auth — a shrinkable box', () => {
    const shrinkable = SITE.match(/className="min-w-0 shrink"/g) ?? []
    expect(shrinkable).toHaveLength(2)
  })

  it('pins both search affordances', () => {
    expect(SITE).toContain('hidden sm:flex shrink-0 items-center')
    expect(SITE).toContain('sm:hidden shrink-0 p-2')
  })
})

describe('AuthButtons: the public auth cluster is pinned and thinned on a phone', () => {
  it('cannot be squeezed off the right edge', () => {
    expect(USER_MENU).toContain('flex shrink-0 items-center gap-1 sm:gap-2')
  })

  // SiteHeader has no mobile drawer and the /discover footer carries no auth link, so this is
  // the only way back into an account on 22 public pages. It buys its room from padding.
  it('keeps Sign in visible below sm', () => {
    expect(USER_MENU).not.toMatch(/href="\/sign-in"[\s\S]{0,160}hidden sm:/)
    expect(USER_MENU).toContain('px-2 py-1.5 rounded-lg transition-colors sm:px-3')
  })
})

// ── THE PHONE LABEL BUDGET (ADR-1196) ────────────────────────────────────────────────────────
//
// 🔴 THE PARAGRAPH AT THE TOP OF THIS FILE OVERSTATES ITS OWN GUARANTEE, and the overstatement
// cost two CI cycles. It says a single give-way child means the bar "cannot be broken by an asset
// swap, a longer CTA label or a denser generation preset". That holds for MarketingHeader. It does
// NOT hold for SiteHeader, because AuthButtons deliberately keeps BOTH links below `sm` (see the
// note beside them): the fixed row there — search glyph, Sign in, the CTA, the mobile menu button
// and four gaps — already spends a 320px line, so once the wordmark has shrunk to nothing there is
// no give-way child left and the next pixel lands outside the viewport.
//
// That is not hypothetical. Renaming BETA_CTA_LABEL from 'Start a Circle' (14) to 'Find your
// people' (16) — TWO characters — put the /discover mobile menu button 18px off a 320px viewport,
// on a `fixed` bar with `overflow-x-clip`, i.e. unreachable. The structural assertions above all
// stayed green through it, because nothing structural changed.
//
// So the label gets a BUDGET as well as a structure. A character count is a proxy for a width and
// an honest one only because every label here renders in one face at one size (Nunito, semibold,
// --text-body-sm); it is deliberately calibrated against a label CI has actually measured rather
// than against a number someone liked:
//
//   'Start a Circle'   14 chars   the label green on main, at 320px, for months
//   'Find your people' 16 chars   +2 chars = +18px of overflow  ⇒  ~9px per character
//
// The ceiling is therefore 14 — the widest label PROVEN to fit — and the compact form the phone
// actually renders is well inside it. The pixel half stays the @overflow gate's job; this is the
// two-minute half, so the next label change fails in `pnpm test` instead of nineteen minutes into
// pr-compare.
describe('the CTA label a PHONE renders is inside the width CI has proven', () => {
  const PROVEN_PHONE_LABEL_CHARS = 'Start a Circle'.length

  it('is short enough that the bar cannot run out of give-way', () => {
    expect({ label: CTA_LABEL_COMPACT, chars: CTA_LABEL_COMPACT.length }).toEqual({
      label: CTA_LABEL_COMPACT,
      chars: CTA_LABEL_COMPACT.length,
    })
    expect(CTA_LABEL_COMPACT.length).toBeLessThanOrEqual(PROVEN_PHONE_LABEL_CHARS)
  })

  // BOTH public headers, because the defect was fixed in one of them and shipped from the other:
  // the compact form went into MarketingHeader while the surface pr-compare was failing on
  // (/discover) renders SiteHeader -> AuthButtons, so the geometry did not move by one pixel.
  it('is the label BOTH public headers put below sm, not just the one', () => {
    for (const [name, src] of [
      ['marketing-header.tsx', MARKETING],
      ['user-menu.tsx (AuthButtons, used by SiteHeader)', USER_MENU],
    ] as const) {
      expect({ file: name, compact: src.includes('<span className="sm:hidden">{CTA_LABEL_COMPACT}</span>') }).toEqual(
        { file: name, compact: true },
      )
    }
  })

  it('never leaves the full label as the only one a phone can render', () => {
    // The failure mode this closes: someone deletes the compact span and keeps the full one,
    // which reads as a tidy-up and is the exact regression.
    for (const src of [MARKETING, USER_MENU]) {
      expect(src).toContain('<span className="hidden sm:inline">')
    }
  })
})

describe('the mobile menu button is never the give-way point', () => {
  it('is pinned, because below md it is the only navigation a visitor has', () => {
    expect(MOBILE_MENU).toContain('className="shrink-0 md:hidden"')
  })
})

describe('AppShell header: the icon cluster holds its width, the brand gives way', () => {
  it('pins the right cluster — `justify-end` means squeezing it overflows LEFT, over the brand', () => {
    expect(SHELL).toContain('flex flex-1 shrink-0 items-center justify-end gap-1 pl-1 pr-2')
  })

  it('does not leave the cluster shrinkable, which is what let the icons reach the wordmark', () => {
    expect(SHELL).not.toContain('flex flex-1 min-w-0 items-center justify-end')
  })

  it('gives the brand link a shrinkable box', () => {
    expect(BRAND).toContain('flex min-w-0 items-center')
  })

  it('caps the mark at its box, so `aspect-ratio` stops acting as a floor', () => {
    expect(BRAND).toContain('brandmark h-[22px] min-w-[6.5rem] max-w-full md:h-8')
  })

  // ── THE SECOND HALF OF THE SAME FIX (owner, 2026-08-16: "The logo was way too small") ────────
  // `max-w-full` gave the header an escape valve with no bottom. Height stays pinned at 22px while
  // width collapses, and the mask is `contain`, so the letterforms shrink to fit the narrower axis
  // and the box pads out the rest: at ~23px of box the mark draws about 3px tall. A smudge, not a
  // logo — and SILENT, because nothing overflows when the give-way child gives way completely.
  // Neither the @overflow gate nor axe has a rule for "the brand is now a smear".
  it('gives the mark a legibility floor, so the give-way child cannot give way to nothing', () => {
    expect(BRAND).toContain('min-w-[6.5rem]')
  })

  // The floor is the backstop; the BUDGET is the fix. These numbers were MEASURED in Chromium
  // (coarse pointer, this app's 17px root, the real compiled globals.css) rather than added up —
  // the mark box against the glyph the `contain` mask actually draws inside it:
  //
  //     viewport   BEFORE (as shipped in #2137)   AFTER
  //     320px      61.9 x 8.4                     130.9 x 17.7
  //     360px      101.9 x 13.8                   163 x 22   (full)
  //     390px      131.9 x 17.8                   163 x 22   (full)
  //     412px      153.9 x 20.8                   163 x 22   (full)
  //
  // So this was never "a little tight on the smallest phones" — the brand was being cut on EVERY
  // phone width, and at 320 it drew eight pixels tall. The cluster's min-content is 165.8px against
  // a 186.3px link, which is why 360 is the first width with any slack.
  //
  // Each of the three assertions below is one of the line items that bought that slack. Losing any
  // one of them puts the header back over 360 and starts eating the brand again, silently.
  describe('the mobile cluster is small enough that the mark never has to shrink', () => {
    it('keeps the Mindless lotus off the phone (owner directive, ~42px of the budget)', () => {
      expect(SHELL).toMatch(/hidden md:inline-flex[\s\S]{0,120}<MindlessLaunch \/>/)
    })

    it('drops the account divider below sm (~19px) rather than the wordmark', () => {
      expect(SHELL).toContain('flex items-center gap-1.5 ml-1 sm:ml-2 sm:border-l sm:border-border sm:pl-2.5')
    })

    it('sizes the bell to match the Friends control beside it instead of 4px wider', () => {
      expect(read('./notification-bell.tsx')).toContain('relative p-1.5 sm:p-2 rounded-lg')
    })
  })

  it('truncates a white-label Space name rather than letting it push the icons', () => {
    expect(BRAND).toContain('truncate font-display')
  })
})

describe('MobileTabBar: seven equal sevenths, whatever the labels say', () => {
  // Before `min-w-0` each tab was floored at its own LABEL's width, so the row was neither equal
  // nor safe: at 360px the tabs measured 49/49/55/49/49/49/59, "The Quest" wrapped onto two lines
  // while its neighbours stayed on one, and the seven min-contents summed to 319px against a 320px
  // screen. One longer label and the last tab (Marketplace) leaves a bar that cannot scroll.
  it('lets every tab shrink to its share', () => {
    expect(SHELL).toContain('flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5 pb-2 text-3xs font-medium transition-colors')
  })

  it('lets the two edge buttons shrink too, so the row stays uniform', () => {
    expect(SHELL).toContain("'flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5 pb-2 text-3xs font-medium text-muted")
    expect(SHELL).toContain('relative flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5 pb-2 text-3xs font-semibold')
  })

  it('clips a long label to one line instead of wrapping or overflowing', () => {
    const labels = SHELL.match(/className="w-full truncate text-center leading-none"/g) ?? []
    // Menu, Zap, and the shared destination-tab renderer.
    expect(labels.length).toBeGreaterThanOrEqual(3)
  })

  it('never lets an icon absorb the shrink — the glyph is what a thumb aims at', () => {
    const icons = SHELL.match(/h-\[22px\] w-\[22px\] shrink-0/g) ?? []
    expect(icons.length).toBeGreaterThanOrEqual(3)
  })
})
