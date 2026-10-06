import { describe, expect, it } from 'vitest'
import { DOOR_FUNNELS, funnelFrom, nextStepFor, type CompletionMoment, type LaunchFunnel } from './next-step'

const FUNNELS: LaunchFunnel[] = ['calm', 'people', 'host', 'practice', 'together']
const MOMENTS: CompletionMoment[] = ['mindless', 'rsvp', 'circle']

describe('funnelFrom', () => {
  it('reads the door campaign first', () => {
    for (const [slug, funnel] of Object.entries(DOOR_FUNNELS)) {
      expect(funnelFrom({ campaign: slug, persona: 'builder' })).toBe(funnel)
    }
    expect(funnelFrom({ campaign: 'Calm-Down-Fast-Oct' })).toBe('calm')
  })

  it('falls back to the induction persona, then Find your people', () => {
    expect(funnelFrom({ campaign: 'spring-promo', persona: 'practitioner' })).toBe('practice')
    expect(funnelFrom({ persona: 'partner' })).toBe('together')
    expect(funnelFrom({ persona: 'builder' })).toBe('host')
    expect(funnelFrom({ persona: 'visitor' })).toBe('people')
    expect(funnelFrom({})).toBe('people')
  })
})

describe('nextStepFor', () => {
  it('gives exactly one in-app step for every funnel and moment', () => {
    for (const f of FUNNELS) {
      for (const m of MOMENTS) {
        const step = nextStepFor(f, m)
        expect(step.href.startsWith('/')).toBe(true)
        expect(step.label.length).toBeGreaterThan(0)
        // Brand copy rules: no em dashes, no prices.
        expect(`${step.label} ${step.body}`).not.toMatch(/[—$%]/)
      }
    }
  })

  it('sends a would-be Host to the Starter Circles gallery, a real route', () => {
    expect(nextStepFor('host', 'mindless').href).toBe('/circles/templates')
  })

  it('points a Circle Host at inviting people to the Circle they just published', () => {
    expect(nextStepFor('host', 'circle', { circleHref: '/circles/sunrise' }).href).toBe('/circles/sunrise')
  })

  it('lands a Mission Patron on Crew from a member funnel only', () => {
    expect(nextStepFor('calm', 'mindless', { patron: true }).label).toBe('Join Crew')
    expect(nextStepFor('people', 'rsvp', { patron: true }).label).toBe('Join Crew')
    expect(nextStepFor('practice', 'mindless', { patron: true }).label).not.toBe('Join Crew')
  })
})
