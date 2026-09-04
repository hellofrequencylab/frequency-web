import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { PosterBand } from './poster-band'
import { coverHeightClass, posterHeightClass, type CoverHeight } from '@/lib/layout/cover-height'

// ── THE PHONE BAND: FULL BLEED, CROPPED, AIMED BY THE HOST ──────────────────────────────────────
//
// 🔴 TWO OWNER REPORTS ON THE SAME BAND, IN OPPOSITE DIRECTIONS, AND BOTH ARE PINNED HERE.
//
// 2026-08-31: the band was a fixed-height box with `object-cover`. The Meld poster is 1400x600 and
// the phone band was 380x306, so `object-cover` scaled by HEIGHT and cropped by WIDTH — 53% of the
// poster reached the screen, and the missing half carried both ends of the event's name. The fix
// was `object-contain`, first below `sm` and then at every width.
//
// 2026-09-04: *"it should be full bleed and adjusted with the focus picker."* Contain had made the
// phone band a 221x221 square of poster in the middle of a 412x221 band — whole, and small, between
// two blurred bars — and the host's focal point had nothing left to aim.
//
// THE PHONE BAND NOW COVERS AGAIN, AND THE FIRST REPORT DOES NOT COME BACK, because the band is a
// different SHAPE than it was that day: short and wide (1.86:1 full bleed at the standard tier)
// rather than 1.24:1. `object-cover` shows the full WIDTH of any source narrower than its band, and
// 19 of the 24 production covers are square or portrait. That arithmetic is the load-bearing half
// of the claim, so it is asserted here rather than asserted-to in a comment.
//
// This file is the sibling of components/vera/dock-tab-clearance.test.ts and works the same way: it
// reads the source and renders the real component, so it fails on the SHAPE of the code rather than
// on a pixel it would have to boot a browser to see. Every assertion was watched go red with the
// defect put back.

const band = readFileSync('components/media/poster-band.tsx', 'utf8')
const eventPage = readFileSync('app/(main)/events/[slug]/page.tsx', 'utf8')
const TIERS: CoverHeight[] = ['short', 'standard', 'tall']

/** What `object-cover` actually shows of a WxH source in a bandW x bandH box, as area. */
function shownArea(w: number, h: number, bandW: number, bandH: number): number {
  const scale = Math.max(bandW / w, bandH / h)
  return Math.min(1, bandW / (w * scale)) * Math.min(1, bandH / (h * scale))
}

/** What `object-cover` actually shows of a WxH source in a bandW x bandH box, as a fraction of the
 *  source's WIDTH. 1 means the artwork reaches both edges and only its height is cut. */
function shownWidth(w: number, h: number, bandW: number, bandH: number): number {
  const scale = Math.max(bandW / w, bandH / h)
  return Math.min(1, bandW / (w * scale))
}

// The phone geometry both reports were photographed on: a 412px viewport, FULL BLEED (the band
// spans the whole width, not the content box), and this app's 17px root — so h-52 is 221px.
const PHONE = 412
const PHONE_BAND_PX: Record<CoverHeight, number> = { short: 170, standard: 221, tall: 306 }

describe('the arithmetic that made this a bug and not a preference', () => {
  it('🔴 object-cover threw away 47% of the Meld poster on a phone, and its title with it', () => {
    // 1400x600 into the OLD standard band (h-72 = 18rem at a 17px root = 306px), on a 412px screen
    // less the page's two 16px gutters. This is the measurement the owner photographed.
    const shown = shownArea(1400, 600, 380, 306)
    expect(shown).toBeLessThan(0.55)
    // And the loss is entirely HORIZONTAL — which is why it ate words rather than sky.
    const scale = Math.max(380 / 1400, 306 / 600)
    expect(Math.min(1, 306 / (600 * scale))).toBe(1)
    expect(Math.min(1, 380 / (1400 * scale))).toBeLessThan(0.55)
  })

  it('🔴 and desktop was the LOUDER number all along — which is why the crop is gone there', () => {
    // The same 24 covers against the 1044x374 desktop band. A 1:1 poster — 13 of the 24 — survived
    // at under 40% of its area on the surface the owner believed was working, against 75%+ on the
    // phone that was reported as broken. This is what keeps `sm:` on `contain`.
    expect(shownArea(1024, 1024, 1044, 374)).toBeLessThan(0.4)
    expect(shownArea(1024, 1024, 380, 306)).toBeGreaterThan(0.75)
    // And a PORTRAIT poster, the worst case, kept a quarter of itself on desktop.
    expect(shownArea(681, 1024, 1044, 374)).toBeLessThan(0.3)
  })
})

describe('the phone band is short and wide, which is what makes the crop safe', () => {
  it('🔴 shows the FULL WIDTH of a square or portrait cover — 19 of the 24 in production', () => {
    const bandH = PHONE_BAND_PX.standard
    // 1:1 (13 of 24) and portrait (6 of 24). Nothing comes off the sides at all.
    expect(shownWidth(1024, 1024, PHONE, bandH)).toBe(1)
    expect(shownWidth(681, 1024, PHONE, bandH)).toBe(1)
    // A 3:2 landscape PHOTO cover is narrower than the band too, so it also reaches both edges.
    expect(shownWidth(1500, 1000, PHONE, bandH)).toBe(1)
    // The loss for a square cover is entirely vertical — the axis the focal picker's hint calls out.
    expect(shownArea(1024, 1024, PHONE, bandH)).toBeCloseTo(bandH / PHONE, 5)
  })

  it('🔴 and the 2026-08-31 poster keeps 80% of its width, against the 53% that was reported', () => {
    // The one cover shape that still crops horizontally is one WIDER than the band (2.33:1 against
    // 1.86:1). It is a real cost, and it is stated plainly in the component; what it must never do
    // is return to the number that produced the report.
    const kept = shownWidth(1400, 600, PHONE, PHONE_BAND_PX.standard)
    expect(kept).toBeGreaterThan(0.79)
    expect(kept).toBeGreaterThan(shownWidth(1400, 600, 380, 306) * 1.4)
  })

  it('the height picker is the lever for that trade — Short is the widest band, Tall the narrowest', () => {
    const aspect = (tier: CoverHeight) => PHONE / PHONE_BAND_PX[tier]
    expect(aspect('short')).toBeGreaterThan(aspect('standard'))
    expect(aspect('standard')).toBeGreaterThan(aspect('tall'))
    // Short (2.42:1) is wider than every cover in the survey, so it crops nothing horizontally —
    // including the 2.33:1 flyer the standard tier trims.
    expect(aspect('short')).toBeGreaterThan(1400 / 600)
    expect(shownWidth(1400, 600, PHONE, PHONE_BAND_PX.short)).toBe(1)
    // 🔴 The lever points the opposite way from the intuition: TALL keeps more height and LESS width.
    expect(shownWidth(1400, 600, PHONE, PHONE_BAND_PX.tall)).toBeLessThan(
      shownWidth(1400, 600, PHONE, PHONE_BAND_PX.standard),
    )
  })

  it('the phone pixel heights above ARE the ladder, not numbers typed beside it', () => {
    // Guards every assertion in this block against the ladder moving underneath it: h-40/h-52/h-72
    // at a 17px root are 170/221/306px. Re-tune a tier and these expectations must be re-derived.
    const REM = 17
    const px = (cls: string): number => {
      const first = cls.split(/\s+/)[0]
      const arbitrary = first.match(/^h-\[([\d.]+)rem\]$/)
      if (arbitrary) return parseFloat(arbitrary[1]) * REM
      const scale = first.match(/^h-(\d+)$/)
      if (scale) return (parseFloat(scale[1]) / 4) * REM
      throw new Error(`unparsed height utility: ${first}`)
    }
    for (const tier of TIERS) {
      expect(px(posterHeightClass(tier)), `tier ${tier}`).toBeCloseTo(PHONE_BAND_PX[tier], 0)
    }
  })
})

describe('the treatment: cropped and aimed on a phone, whole from sm up', () => {
  const markup = renderToStaticMarkup(
    <PosterBand src="https://example.test/p.png" heightClass={posterHeightClass('standard')} focus="49% 48%" />,
  )

  it('🔴 covers on a phone and contains from sm up — one fit per surface geometry', () => {
    expect(markup).toContain('object-cover sm:object-contain')
    // The class it must never regain. `sm:object-cover` is precisely what left 23 of 24 covers
    // losing more than a quarter of their artwork on desktop (LIVE-131), and the 2026-09-04 report
    // was about phones only.
    expect(markup).not.toContain('sm:object-cover')
  })

  it("🔴 renders the host's focal point — the half of the report the crop exists to serve", () => {
    // "adjusted with the focus picker". Under `contain` this attribute was inert; under the phone
    // crop it decides which slice of the poster survives.
    expect(markup).toContain('object-position:49% 48%')
  })

  it('fills the letterbox with the poster itself, at the width that HAS a letterbox', () => {
    // The blurred backdrop is what stops `contain` from reading as a rendering failure, so it
    // belongs exactly where bars can appear: from `sm` up, where the band contains. A covered phone
    // band is opaque edge to edge, so a blurred copy under it is a decode paid for nothing on the
    // surface least able to afford one.
    const backdrop = markup.slice(markup.indexOf('<div', markup.indexOf('<div') + 1))
    expect(backdrop).toContain('blur-2xl')
    expect(backdrop).toContain('hidden')
    expect(backdrop).toContain('sm:block')
    expect(backdrop).toContain('background-image:url(&quot;https://example.test/p.png&quot;)')
  })

  it('the backdrop is inert — it is the poster again, so it carries nothing and takes no tap', () => {
    const backdrop = markup.slice(markup.indexOf('<div', markup.indexOf('<div') + 1))
    expect(backdrop).toContain('aria-hidden')
    expect(backdrop).toContain('pointer-events-none')
  })
})

describe('the poster ladder is the cover ladder with a shorter phone half', () => {
  it('🔴 every tier keeps its sm: height BYTE FOR BYTE — the desktop band still does not move', () => {
    for (const tier of TIERS) {
      const smOf = (cls: string) => cls.split(/\s+/).filter((c) => c.startsWith('sm:')).join(' ')
      expect(smOf(posterHeightClass(tier)), `tier ${tier}`).toBe(smOf(coverHeightClass(tier)))
    }
  })

  it('and every tier IS shorter on a phone, which is now what keeps the crop off the sides', () => {
    // "Make it shorter and more of a horizontal layout" (2026-08-31). The rung was first cut
    // because a contain-fitted poster did not use the whole box; it STAYS cut for a stronger
    // reason, now that the phone band covers — a shorter band is a WIDER one, and `object-cover`
    // only leaves the sides alone while the band is wider than the source.
    // Tailwind's `h-N` is N/4 rem while `h-[Xrem]` is X rem — the two ladders use both spellings
    // (h-72 is 18rem, not 72), so the comparison has to normalise before it means anything.
    const rem = (cls: string): number => {
      const first = cls.split(/\s+/)[0]
      const arbitrary = first.match(/^h-\[([\d.]+)rem\]$/)
      if (arbitrary) return parseFloat(arbitrary[1])
      const scale = first.match(/^h-(\d+)$/)
      if (scale) return parseFloat(scale[1]) / 4
      throw new Error(`unparsed height utility: ${first}`)
    }
    // The parser earns its keep: h-72 (18rem) really is shorter than h-[24rem], and reading the
    // bare numbers would have said 72 > 24 and passed a ladder that got TALLER on phones.
    expect(rem('h-72')).toBe(18)
    expect(rem('h-[24rem]')).toBe(24)
    for (const tier of TIERS) {
      const [poster, cover] = [posterHeightClass(tier), coverHeightClass(tier)]
      expect(rem(poster), `tier ${tier} must be shorter on a phone`).toBeLessThan(rem(cover))
    }
  })
})

describe('the band takes its height, it does not know one', () => {
  it('🔴 declares no height utility of its own — the ladder is the single source', () => {
    // The tiers are operator-controlled (Short / Standard / Tall on events.theme.heroHeight). A
    // literal `h-52` in here would be a second ladder that the picker cannot move, which is the
    // duplicate-number failure the bottom-lane contract records three times one directory over.
    const code = band.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/\bh-\d+\b/)
    expect(code).not.toMatch(/\bh-\[[\d.]+rem\]/)
    expect(code).toContain('${heightClass}')
  })
})

describe('the event page actually uses it', () => {
  it('renders the band rather than a hand-rolled object-cover box', () => {
    expect(eventPage).toContain('<PosterBand')
    expect(eventPage).toContain('heightClass={posterHeightCls}')
  })

  it('🔴 and the raw cropping box it replaced is GONE from the cover slot', () => {
    // Matched against the code with comments stripped: the cover slot's comment deliberately
    // quotes what was wrong, and the file legitimately still discusses object-cover elsewhere.
    const code = eventPage.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toContain('className="object-cover"')
  })

  it('the no-cover placeholder shares the band height, so the page rhythm does not depend on art', () => {
    // An event WITHOUT a poster must not get a taller header than one with it.
    //
    // ⚠️ This used to pin the literal '${posterHeightCls} w-full items-center justify-center'. The
    // width was incidental to what the test is named for, and baking it in meant the HEIGHT
    // assertion broke when the placeholder's width was corrected for the full bleed. Assert the
    // height class and the centring; the width has its own test below.
    expect(eventPage).toContain('${posterHeightCls}')
    expect(eventPage).toContain('items-center justify-center')
    expect(eventPage).not.toContain('heroHeightCls')
  })
})

// ── THE FULL BLEED WAS HALF-APPLIED, BECAUSE TWO WIDTH CLASSES LANDED ON ONE ELEMENT ─────────────
//
// 🔴 THE SECOND OWNER REPORT off the same page (2026-09-01): the phone band bled off the LEFT edge
// and stopped short on the RIGHT, leaving a stripe of page colour down one side.
//
// The cause was this component protecting `rounded-*` from the no-tailwind-merge trap and then
// baking `w-full` into the very same base string. The event page asked for a full bleed with
// `className="-mx-4 w-auto sm:mx-0 sm:w-full"`, so the element rendered carrying BOTH `w-full` and
// `w-auto`, and `w-full` won. The margins still pulled it one gutter left; the width never grew.
//
// The geometry is exact rather than approximate: `margin-left: -1rem` on a `width: 100%` child of a
// `px-4` content box puts the left edge at 0 and the right edge at `viewport - 2rem`. A 34px stripe,
// which is what the capture shows.
//
// So the rule is structural: ONE width class on the element, chosen by a prop, never appended.
describe('the full bleed the owner asked for actually reaches both edges', () => {
  /** Every Tailwind width utility on the root element, split by breakpoint prefix. */
  function widthsByBreakpoint(markup: string): Record<string, string[]> {
    const cls = markup.match(/class="([^"]*)"/)?.[1] ?? ''
    const out: Record<string, string[]> = {}
    for (const token of cls.split(/\s+/)) {
      const m = token.match(/^(?:([a-z]+):)?(w-[\w[\]/.%-]+)$/)
      if (m) (out[m[1] ?? 'base'] ??= []).push(m[2])
    }
    return out
  }

  it('renders exactly ONE width utility per breakpoint — the collision that shipped', () => {
    const markup = renderToStaticMarkup(
      <PosterBand
        src="/x.png"
        heightClass={posterHeightClass('standard')}
        className="-mx-4 sm:mx-0"
        widthClass="w-auto sm:w-full"
        radiusClass="rounded-none sm:rounded-2xl"
      />,
    )
    for (const [bp, widths] of Object.entries(widthsByBreakpoint(markup))) {
      expect(widths, `${widths.length} width classes at "${bp}" — they fight, and this repo's cn has no tailwind-merge`).toHaveLength(1)
    }
  })

  it('gives the phone band w-auto so the negative margin can widen it, not just shift it', () => {
    const markup = renderToStaticMarkup(
      <PosterBand
        src="/x.png"
        heightClass={posterHeightClass('standard')}
        className="-mx-4 sm:mx-0"
        widthClass="w-auto sm:w-full"
      />,
    )
    const w = widthsByBreakpoint(markup)
    // `w-auto` + negative margins = content width + both gutters. `w-full` + negative margins =
    // content width, shifted. Only the first is a full bleed.
    expect(w.base).toEqual(['w-auto'])
    expect(w.sm).toEqual(['w-full'])
  })

  it('keeps w-full as the default, so the framed callers are untouched', () => {
    const markup = renderToStaticMarkup(
      <PosterBand src="/x.png" heightClass={posterHeightClass('standard')} />,
    )
    expect(widthsByBreakpoint(markup).base).toEqual(['w-full'])
  })

  it('the event page passes its width through the PROP, never appended to className', () => {
    // The regression is re-introduced by moving `w-auto` back into className, where it collides
    // again. Assert the call site's shape, not just the component's.
    const call = eventPage.slice(eventPage.indexOf('<PosterBand'), eventPage.indexOf('radiusClass="rounded-none sm:rounded-2xl"'))
    expect(call).toContain('widthClass="w-auto sm:w-full"')
    expect(call, 'a w-* back inside className is the exact collision that shipped').not.toMatch(
      /className="[^"]*\bw-/,
    )
  })

  it('the no-cover placeholder bleeds too — it had the same defect and no w-auto at all', () => {
    const ph = eventPage.slice(eventPage.indexOf('// No cover: a designed placeholder'))
    const cls = ph.match(/className=\{`([^`]*)`\}/)?.[1] ?? ''
    expect(cls).toContain('-mx-4')
    expect(cls, 'w-full with -mx-4 shifts the box instead of widening it').toContain('w-auto')
    expect(cls).toContain('sm:w-full')
  })
})
