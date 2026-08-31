import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { PosterBand } from './poster-band'
import { coverHeightClass, posterHeightClass, type CoverHeight } from '@/lib/layout/cover-height'

// ── THE POSTER'S OWN TITLE WAS BEING CROPPED OFF THE PAGE ────────────────────────────────────────
//
// 🔴 THE BUG (owner, 2026-08-31, off a phone capture of the Meld event page). The event cover is a
// fixed-height box with `object-cover` on it. The Meld poster is 1400x600; the mobile band is
// 380x306 at a 412px viewport and this app's 17px root. `object-cover` scales to cover the shorter
// axis, so the poster is scaled by HEIGHT to 714x306 and then cropped by width to 380 — 53% of it,
// including both halves of its own title, never reaches the screen.
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

  it('🔴 and desktop was the LOUDER number all along — which is why the crop is gone there too', () => {
    // The same 24 covers against the 1044x374 desktop band. This assertion used to exist to argue
    // the desktop half should WAIT; the arithmetic it pins is what eventually settled the opposite
    // (LIVE-131). A 1:1 poster — 13 of the 24 — survived at under 40% of its area on the surface
    // the owner believed was working, against 75%+ on the phone that was reported as broken.
    expect(shownArea(1024, 1024, 1044, 374)).toBeLessThan(0.4)
    expect(shownArea(1024, 1024, 380, 306)).toBeGreaterThan(0.75)
    // And a PORTRAIT poster, the worst case, kept a quarter of itself on desktop.
    expect(shownArea(681, 1024, 1044, 374)).toBeLessThan(0.3)
  })
})

describe('the treatment: the whole poster, at every width', () => {
  const markup = renderToStaticMarkup(
    <PosterBand src="https://example.test/p.png" heightClass={posterHeightClass('standard')} focus="49% 48%" />,
  )

  it('🔴 fits the WHOLE poster, and never crops at any width', () => {
    expect(markup).toContain('object-contain')
    // The class it must never regain. `sm:object-cover` is precisely what left 23 of 24 covers
    // losing more than a quarter of their artwork on desktop (LIVE-131).
    expect(markup).not.toContain('object-cover')
  })

  it('fills the letterbox with the poster itself, at every width', () => {
    // The blurred backdrop is what stops `contain` from reading as a rendering failure. It used to
    // be `sm:hidden`, because the desktop band still cropped and had no bars to fill; now that it
    // contains everywhere, the backdrop has to be everywhere too or desktop letterboxes onto bare
    // page colour.
    expect(markup).toContain('blur-2xl')
    expect(markup).not.toContain('sm:hidden')
    expect(markup).toContain('background-image:url(&quot;https://example.test/p.png&quot;)')
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

  it('and every tier IS shorter on a phone, which is the half the owner asked for', () => {
    // "Make it shorter and more of a horizontal layout." A contain-fitted poster does not use the
    // whole box, so the box has to come down or the saving is just blurred filler.
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
    expect(eventPage).toContain('${posterHeightCls} w-full items-center justify-center')
    expect(eventPage).not.toContain('heroHeightCls')
  })
})
