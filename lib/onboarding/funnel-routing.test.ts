import { describe, it, expect } from 'vitest'
import {
  GENERAL_FUNNEL_DESTINATION,
  NICHE_FUNNEL_DESTINATIONS,
  nicheFunnelDestination,
  spaceCreatePath,
  DEFAULT_SEQUENCE,
} from './beta-sequences'
import { isSafeInAppPath, funnelLanding } from './funnel-destination'
import { COACHES_FUNNEL, funnelStartDestination } from '@/lib/marketing/funnel-config'
import { PERSONAS, personaFunnelDestination } from '@/lib/marketing/personas'

// Funnel routing (owner directive): "The general beta splash funnel should be the only one that goes to
// the Beta list. All other funnels should take them to the section the funnel is targeted at." Locked
// here: the general funnel stays on the waitlist/Beta-list landing, every niche funnel routes to its own
// Space-create section, and every niche destination is a safe in-app path.

// The five operator niches and the Space Mode each targets (OPERATOR-FUNNELS.md §5 Start-free bridge).
const EXPECTED_NICHE_MODE: Record<string, string> = {
  coaches: 'business:packages',
  studios: 'business:membership',
  hosts: 'business:ticketed',
  communities: 'business:cohort',
  nonprofits: 'nonprofit:donations',
}

describe('spaceCreatePath', () => {
  it('builds a safe /spaces/new path carrying the Mode key', () => {
    const url = spaceCreatePath({ type: 'business', variant: 'packages' })
    expect(url).toBe('/spaces/new?mode=business:packages')
    expect(isSafeInAppPath(url)).toBe(true)
  })
})

describe('the general funnel keeps the Beta-list landing', () => {
  it('the general destination is the waitlist', () => {
    expect(GENERAL_FUNNEL_DESTINATION).toEqual({ mode: 'waitlist' })
  })

  it('a waitlist destination falls back to the caller landing (the Beta list), never a direct url', () => {
    expect(funnelLanding(GENERAL_FUNNEL_DESTINATION, '/feed?welcome=vera')).toBe('/feed?welcome=vera')
  })

  it('the default sequence slug has no niche destination override', () => {
    expect(nicheFunnelDestination(DEFAULT_SEQUENCE)).toBeUndefined()
  })
})

describe('every niche funnel routes to its own section', () => {
  it('covers exactly the five operator niches', () => {
    expect(Object.keys(NICHE_FUNNEL_DESTINATIONS).sort()).toEqual(Object.keys(EXPECTED_NICHE_MODE).sort())
  })

  for (const [niche, mode] of Object.entries(EXPECTED_NICHE_MODE)) {
    it(`${niche} -> Space-create pre-seeded in ${mode}`, () => {
      const dest = nicheFunnelDestination(niche)
      expect(dest).toEqual({ mode: 'direct', url: `/spaces/new?mode=${mode}` })
      // Direct destinations must survive the safety gate, so the redirect actually lands there.
      expect(dest?.mode).toBe('direct')
      if (dest?.mode === 'direct') {
        expect(isSafeInAppPath(dest.url)).toBe(true)
        expect(funnelLanding(dest, '/feed?welcome=vera')).toBe(dest.url)
      }
    })
  }

  it('an unknown slug has no niche destination (keeps the general landing)', () => {
    expect(nicheFunnelDestination('not-a-niche')).toBeUndefined()
    expect(nicheFunnelDestination('')).toBeUndefined()
    expect(nicheFunnelDestination(null)).toBeUndefined()
  })
})

describe('marketing door destinations agree with the onboarding side (one source of truth)', () => {
  it('the coaches funnel door derives the same Space-create destination', () => {
    expect(funnelStartDestination(COACHES_FUNNEL)).toEqual(nicheFunnelDestination('coaches'))
  })

  it('every /for persona door yields a safe direct Space-create destination', () => {
    for (const persona of PERSONAS) {
      const dest = personaFunnelDestination(persona)
      expect(dest.mode).toBe('direct')
      if (dest.mode === 'direct') {
        expect(dest.url).toBe(`/spaces/new?mode=${persona.type}:${persona.variant}`)
        expect(isSafeInAppPath(dest.url)).toBe(true)
      }
    }
  })
})
