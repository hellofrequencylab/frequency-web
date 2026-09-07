import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// THE DOOR BUTTON AND THE INDUCTION ARE THE TWO ENDS OF ONE ROAD (ADR-1238, SCAN-538).
//
// lib/funnels/routing.test.ts proves the pure functions: every /for door derives `/join?seq=<niche>` and
// every niche has a Space-create destination row. This file proves the RENDER actually uses them. Until
// 2026-09-07 the pure half was green while every button on the door carried a literal '/spaces', so the
// destination map that was tested, documented and cross-referenced had no runtime reader at all: the map
// was the spelling of a road nobody drove on. Source-shape, because the guard is "no literal survives
// here", and a literal is exactly what a render test with the right config would not notice.

const sections = readFileSync('components/marketing/funnel/funnel-sections.tsx', 'utf8')
const template = readFileSync('components/marketing/funnel/niche-funnel.tsx', 'utf8')
const join = readFileSync('app/join/(induction)/page.tsx', 'utf8')

describe('every Start free on a niche door derives its href from the config', () => {
  it('no button carries a literal start path', () => {
    expect(sections).not.toMatch(/FUNNEL_START_HREF/)
    expect(sections).not.toMatch(/href=["']\/spaces["']/)
    expect(sections).not.toMatch(/href=["']\/join/)
  })

  it('every Button href on the door is the derived start href', () => {
    // Anchors to sections (#how-it-works) are the only other hrefs a Button may carry; every other one
    // must be derived. Count them so a sixth button added with a literal fails here, not in production.
    const hrefs = [...sections.matchAll(/<Button\s+href=\{?([^}\s>]+)\}?/g)].map((m) => m[1])
    const derived = hrefs.filter((h) => h === 'funnelStartHref(config)')
    const anchors = hrefs.filter((h) => h.startsWith('"#'))
    expect(hrefs.length).toBeGreaterThanOrEqual(5)
    expect(derived.length + anchors.length).toBe(hrefs.length)
    expect(derived.length).toBe(5) // header, sticky mobile, hero, pricing, final CTA
  })

  it('the two chrome pieces that used to render without a config now receive it', () => {
    expect(sections).toContain('export function SplashHeader({ config }: { config: FunnelConfig })')
    expect(sections).toContain('export function StickyMobileCta({ config }: { config: FunnelConfig })')
    expect(template).toContain('<SplashHeader config={config} />')
    expect(template).toContain('<StickyMobileCta config={config} />')
  })
})

describe('the induction honours the sequence destination for a member who is already onboarded', () => {
  it('the onboarded redirect goes through funnelLanding, not a bare /feed', () => {
    // A signed-in operator who clicks a niche door asked for Create-a-Space pre-seeded; until this
    // branch read the sequence destination they landed on the feed and the door was broken for exactly
    // the audience most likely to create a Space.
    expect(join).toContain("redirect(funnelLanding(funnel.destination, '/feed'))")
    expect(join).not.toContain("redirect(nextDestination ? nextDestination.url : '/feed')")
    expect(join).toMatch(/import \{ isSafeInAppPath, funnelLanding \} from '@\/lib\/funnels\/destination'/)
  })
})
