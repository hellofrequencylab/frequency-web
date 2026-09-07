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
  FUNNEL_START_FALLBACK_HREF,
  funnelSlugs,
  getFunnelConfig,
  funnelStartDestination,
  funnelStartHref,
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
  // ADR-1238 (SCAN-538). The /for door slug (`coaches-and-healers`) and the funnel sequence slug
  // (`coaches`) are two vocabularies on purpose; `FunnelConfig.niche` is the ONE bridge, and the Space
  // Mode is declared ONCE, on the NICHE_FUNNEL_DESTINATIONS row. Until 2026-09-07 every door button was
  // the literal '/spaces', so the map these assertions cover had no runtime reader at all.
  it('the coaches funnel door reads the same Space-create destination the induction lands on', () => {
    expect(funnelStartDestination(COACHES_FUNNEL)).toEqual(nicheFunnelDestination('coaches'))
    expect(funnelStartDestination(COACHES_FUNNEL)).toEqual({
      mode: 'direct',
      url: '/spaces/new?mode=business:packages',
    })
  })

  // Phase 7 deletion sweep: this used to iterate a SECOND persona registry (lib/marketing/personas.ts)
  // that nothing but tests imported. The registry is gone; the assertion now runs over the ONE registry
  // /for/<slug> actually renders from, so it locks the live doors instead of a shadow copy of them.
  it('every /for door names a niche with a destination row, and that row is a safe direct Space-create path', () => {
    for (const slug of funnelSlugs()) {
      const config = getFunnelConfig(slug)
      expect(config, slug).toBeDefined()
      expect(Object.keys(NICHE_FUNNEL_DESTINATIONS), `${slug} -> ${config!.niche}`).toContain(config!.niche)
      const dest = funnelStartDestination(config!)
      expect(dest?.mode, slug).toBe('direct')
      if (dest?.mode === 'direct') {
        expect(dest.url).toMatch(/^\/spaces\/new\?mode=[a-z]+:[a-z]+$/)
        expect(isSafeInAppPath(dest.url)).toBe(true)
      }
    }
  })

  it('every /for door starts ITS OWN funnel sequence, never the literal directory', () => {
    // The consequence the row measured: the button must produce the URL whose completion reads the map.
    for (const slug of funnelSlugs()) {
      const config = getFunnelConfig(slug)!
      expect(funnelStartHref(config)).toBe(`/join?seq=${config.niche}`)
      expect(funnelStartHref(config)).not.toBe(FUNNEL_START_FALLBACK_HREF)
    }
  })

  it('the five doors cover the five destination rows, so no row is unreachable from a door', () => {
    const fromDoors = funnelSlugs()
      .map((slug) => getFunnelConfig(slug)!.niche)
      .sort()
    expect(fromDoors).toEqual(Object.keys(NICHE_FUNNEL_DESTINATIONS).sort())
  })

  it('a door whose niche has no destination row falls back to the directory instead of the waitlist', () => {
    // The fallback is the ONLY reason the runtime read exists: running this visitor through the
    // induction would end on the general Beta list, which is a worse promise than the directory.
    const orphan = { ...COACHES_FUNNEL, slug: 'a-sixth-door', niche: 'not-a-niche' }
    expect(funnelStartDestination(orphan)).toBeUndefined()
    expect(funnelStartHref(orphan)).toBe(FUNNEL_START_FALLBACK_HREF)
    expect(FUNNEL_START_FALLBACK_HREF).toBe('/spaces')
  })
})
