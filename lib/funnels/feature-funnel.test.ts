import { describe, it, expect } from 'vitest'
import { FUNNEL_STYLES, funnelStyle } from '@/lib/funnels/funnel-styles'
import { getSequence, BETA_SEQUENCES } from '@/lib/onboarding/beta-sequences'
import { patternBySlug } from '@/lib/on-air'
import { getTrait } from '@/lib/traits/registry'
import { isTrackedEvent } from '@/lib/analytics/events'

// The breathwork FEATURE funnel (ADR-619) is the first playable front door. These lock the contract
// the renderer + signup pipeline depend on, so a refactor can't silently unwire it.
describe('breathwork feature funnel — the wiring contract', () => {
  it('registers as a code sequence with the feature style + box demo', () => {
    const seq = getSequence('breathwork')
    expect(seq.slug).toBe('breathwork')
    expect(seq.style).toBe('feature')
    expect(seq.feature?.feature).toBe('breathwork')
    // The demo pattern must resolve to a real breath pattern (box = In-4/Hold-4/Out-4/Hold-4).
    const pattern = patternBySlug(seq.feature?.pattern)
    expect(pattern.slug).toBe('box')
    expect(pattern.phases).toHaveLength(4)
  })

  it('lands the finisher in the app (a real round starts a real streak)', () => {
    const seq = getSequence('breathwork')
    expect(seq.destination).toEqual({ mode: 'direct', url: '/feed?welcome=vera' })
  })

  it('its marketing tag is registered, so signup attribution is not skipped', () => {
    const seq = getSequence('breathwork')
    expect(seq.marketingTag).toBe('beta_breathwork')
    expect(getTrait('beta_breathwork')).toBeTruthy()
  })

  it('the funnel analytics events it fires are in the taxonomy and client-emittable', () => {
    expect(isTrackedEvent('onboarding.funnel_entered')).toBe(true)
    expect(isTrackedEvent('onboarding.funnel_captured')).toBe(true)
  })

  it('exposes breathwork under BETA_SEQUENCES', () => {
    expect(BETA_SEQUENCES.breathwork).toBeDefined()
  })
})

// The Feature STYLE is live now that its renderer ships (the Splash Funnels page reads this to move it
// out of the "planned" placeholders into a real section).
describe('funnel-styles registry — feature is live', () => {
  it('feature style is marked live', () => {
    expect(funnelStyle('feature').status).toBe('live')
  })
  it('onboarding is still the default', () => {
    expect(funnelStyle(undefined).id).toBe('onboarding')
    expect(FUNNEL_STYLES.some((s) => s.id === 'demographic' && s.status === 'planned')).toBe(true)
  })
})
