import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

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

  // The floor is the backstop; the BUDGET is the fix. Measured at this app's 17px root:
  //   link    pl-3.5 14.9 + mark 163 + pr-2 8.5                                    = 186.4
  //   cluster pl-1 4.25 + search 34 + 4.25 + friends 34 + 4.25 + bell 34
  //           + account ml-1 4.25 + avatar 34 + pr-2 8.5                           = 161.5
  //   total                                                                        = 347.9
  // so 360 and 390 both clear it with the mark at its FULL width and nothing shrinking at all.
  // Each of the three assertions below is one of the line items that made that sum fit; losing any
  // one of them puts the header back over 360 and starts eating the brand again.
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
