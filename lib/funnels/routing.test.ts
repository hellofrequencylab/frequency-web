import { describe, it, expect } from 'vitest'
import {
  GENERAL_FUNNEL_DESTINATION,
  NICHE_FUNNEL_DESTINATIONS,
  nicheFunnelDestination,
  spaceCreatePath,
  DEFAULT_FUNNEL,
} from './definitions'
import { isSafeInAppPath, funnelLanding } from './destination'
import {
  COACHES_FUNNEL,
  funnelSlugs,
  getFunnelConfig,
  funnelStartDestination,
} from '@/lib/marketing/funnel-config'

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
    expect(nicheFunnelDestination(DEFAULT_FUNNEL)).toBeUndefined()
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

  // Phase 7 deletion sweep: this used to iterate a SECOND persona registry (lib/marketing/personas.ts)
  // that nothing but tests imported. The registry is gone; the assertion now runs over the ONE registry
  // /for/<slug> actually renders from, so it locks the live doors instead of a shadow copy of them.
  it('every /for door yields a safe direct Space-create destination', () => {
    for (const slug of funnelSlugs()) {
      const config = getFunnelConfig(slug)
      expect(config, slug).toBeDefined()
      const dest = funnelStartDestination(config!)
      expect(dest.mode).toBe('direct')
      if (dest.mode === 'direct') {
        expect(dest.url).toBe(`/spaces/new?mode=${config!.mode.type}:${config!.mode.variant}`)
        expect(isSafeInAppPath(dest.url)).toBe(true)
      }
    }
  })
})
