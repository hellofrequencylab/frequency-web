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

const template = readFileSync('components/frequency/site/pages/funnel/niche/niche-door.tsx', 'utf8')
const join = readFileSync('app/join/(induction)/page.tsx', 'utf8')
describe('active niche doors derive their real induction destination', () => {
  it('uses the canonical destination in the body and sticky start pill', () => {
    expect(template).toContain('const start = funnelStartHref(config)')
    expect(template).toContain('<NicheStartPill href={start}')
    expect(template).toContain('href={start}')
    expect(template).not.toMatch(/href=["']\/join/)
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
