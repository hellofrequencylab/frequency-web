import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { coverHeightClass, EVENT_POSTER_DESKTOP_WIDTH_PX, EVENT_POSTER_PHONE_WIDTH_PX, posterBandAspect, posterBandHeightPx, posterHeightClass, posterHeightPx, type CoverHeight } from './cover-height'
// Retained geometry is used by the actual focal-picker controls. These math tests
// do not claim the current Frequency foreground crops: its later owner ruling is contain.
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

  it('🔴 a TIER-SHAPED desktop band is the loud number, and is why the shape must come from the art', () => {
    // The same 24 covers against a GUESSED 1044x374 desktop band. A 1:1 poster — 13 of the 24 —
    // survives at under 40% of its area, and a portrait one at under 30%. Those are the numbers
    // that sent the desktop half to `contain` in the first place (LIVE-131), and they are still
    // true of a band that does not know its poster.
    expect(shownArea(1024, 1024, 1044, 374)).toBeLessThan(0.4)
    expect(shownArea(681, 1024, 1044, 374)).toBeLessThan(0.3)
    // The answer was never `contain` — it was the shape. With the poster's own aspect known
    // (ADR-1248) the band is 1044x1044 for a square cover, clamped to the 374 tier, and the crop
    // is the tier's, on the HEIGHT, aimed by the focal point the owner set. Nothing comes off the
    // sides at any width, for any cover.
    expect(shownWidth(1024, 1024, 1044, 374)).toBe(1)
    expect(shownWidth(681, 1024, 1044, 374)).toBe(1)
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


describe('the crop preview is the same shape as the band it previews', () => {
  it('🔴 with NO measured poster, the preview is the tier-shaped band', () => {
    // 1044px centre column over the standard tier's sm height (h-[22rem] = 374px at a 17px root).
    expect(posterHeightPx('standard')).toBe(374)
    expect(posterBandAspect('standard', 1044)).toBeCloseTo(1044 / 374, 6)
    // And the stock 16/9 it replaced is a different frame entirely — this is not a no-op rename.
    expect(Math.abs(posterBandAspect('standard', 1044) - 16 / 9)).toBeGreaterThan(1)
  })

  it('🔴 with a poster TALLER than the tier, the preview is still the tier — that is the crop', () => {
    // A 1:1 cover at 1044px wants a 1044px-tall band; the ceiling clamps it to 374. So the frame
    // the host drags inside is 1044x374, which is precisely what the page paints.
    expect(posterBandAspect('standard', 1044, 1)).toBeCloseTo(1044 / 374, 6)
    expect(posterBandAspect('standard', 1044, 0.665)).toBeCloseTo(1044 / 374, 6) // portrait
  })

  it('with a poster the band shows WHOLE, the preview shows it whole too — nothing to aim', () => {
    // 1400x600 at 1044px is 447px tall, over the 374 ceiling... so it clamps. A wider flyer does
    // not: 3:1 at 1044px is 348px, under the ceiling, and the band IS the poster.
    expect(posterBandAspect('standard', 1044, 3)).toBe(3)
    expect(posterBandAspect('tall', 1044, 1400 / 600)).toBeCloseTo(1400 / 600, 6)
  })

  it('every tier gives a different frame, so the height picker moves the preview', () => {
    const [short, standard, tall] = TIERS.map((t) => posterBandAspect(t, 1044))
    expect(short).toBeGreaterThan(standard)
    expect(standard).toBeGreaterThan(tall)
  })

  it('an unusable measurement is treated as absent, exactly as the band treats it', () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      expect(posterBandAspect('standard', 1044, bad), `aspect ${bad}`).toBeCloseTo(1044 / 374, 6)
    }
    expect(posterBandAspect('standard', 1044, null)).toBeCloseTo(1044 / 374, 6)
  })

  it('the phone band is one rung shorter, so a phone WIDTH over a desktop HEIGHT is the wrong frame', () => {
    // LIVE-272: the naive "second call" (width 412, desktop height 374) is 1.10:1, not the
    // 412x221 (1.86:1) the page paints. The surface argument is the load-bearing half.
    expect(posterBandHeightPx('standard', 'phone')).toBe(221)
    expect(posterBandHeightPx('standard', 'desktop')).toBe(374)
    expect(posterHeightPx('standard')).toBe(374)
    expect(EVENT_POSTER_DESKTOP_WIDTH_PX).toBe(1044)
    expect(
      posterBandAspect('standard', EVENT_POSTER_DESKTOP_WIDTH_PX, null, 'desktop'),
    ).toBeCloseTo(EVENT_POSTER_DESKTOP_WIDTH_PX / 374, 6)
    expect(
      posterBandAspect('standard', EVENT_POSTER_PHONE_WIDTH_PX, null, 'phone'),
    ).toBeCloseTo(EVENT_POSTER_PHONE_WIDTH_PX / 221, 6)
    expect(
      posterBandAspect('standard', EVENT_POSTER_PHONE_WIDTH_PX, null, 'desktop'),
    ).toBeCloseTo(EVENT_POSTER_PHONE_WIDTH_PX / 374, 6)
    expect(
      Math.abs(
        posterBandAspect('standard', EVENT_POSTER_PHONE_WIDTH_PX, null, 'phone') -
          posterBandAspect('standard', EVENT_POSTER_PHONE_WIDTH_PX, null, 'desktop'),
      ),
    ).toBeGreaterThan(0.5)
  })

  it('the event header control previews both surfaces — a desktop-only frame is not a preview', () => {
    const controls = readFileSync('components/admin/modules/event-header-controls.tsx', 'utf8')
    expect(controls).toContain("from '@/lib/layout/cover-height'")
    expect(controls).toContain('EVENT_POSTER_PHONE_WIDTH_PX')
    expect(controls).toContain('EVENT_POSTER_DESKTOP_WIDTH_PX')
    expect(controls).toContain("posterBandAspect(height, EVENT_POSTER_PHONE_WIDTH_PX, aspect, 'phone')")
    expect(controls).toContain(
      "posterBandAspect(height, EVENT_POSTER_DESKTOP_WIDTH_PX, aspect, 'desktop')",
    )
    expect(controls).not.toContain('posterBandAspect(height, 1044, aspect)')
    // The measured shape has to be STATE, or a swapped cover re-measures into a ref and the
    // preview keeps the old frame until something else re-renders the panel.
    expect(controls).toContain('setAspect(measured)')
  })
})
