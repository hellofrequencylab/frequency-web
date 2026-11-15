import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { getJourney, toFunnelSpec, computeJourneyFunnel } from './journeys'
import { isTrackedEvent } from './events'

const journey = getJourney('land_to_beta')!
describe('current acquisition funnel SQL specification', () => {
  it('does not seed an empty member cohort from retired waitlist markers', () => {
    const spec = toFunnelSpec(journey)
    const actorStart = spec.findIndex(step => step.stream === 'engagement')
    expect(spec[actorStart].markers).toEqual(['account.created'])
    expect(spec.flatMap(step => step.markers)).not.toContain('waitlist.joined')
    expect(spec.flatMap(step => step.markers)).not.toContain('application.submitted')
    for (const step of spec.filter(step => step.stream === 'engagement')) {
      for (const marker of step.markers) expect(isTrackedEvent(marker), marker).toBe(true)
    }
  })
  it('uses the current joining entry instead of the retired beta route', () => {
    const step = toFunnelSpec(journey).find(step => step.key === 'reached_the_invitation')!
    expect(step.stream).toBe('interaction')
    expect(step.markers).toEqual(['web_vital'])
    expect(step.pathLike).toBe('/join%')
    // The real emitter records the landing path. Its limits must remain explicit in the readout.
    const emitter = readFileSync('components/analytics/web-vitals.tsx', 'utf8')
    expect(emitter).toContain('path: templatePath(landingPath)')
    expect(journey.steps[0].note).toMatch(/sample/i)
    expect(journey.steps.find(s => s.key === 'reached_the_invitation')!.note).toMatch(/landing/i)
  })
  it('shows measured member progression independently across the anonymous identity break', () => {
    const funnel = computeJourneyFunnel(journey, [
      { stepKey: 'landed', subjects: 100 },
      { stepKey: 'reached_the_invitation', subjects: 30 },
      { stepKey: 'account_created', subjects: 10 },
      { stepKey: 'induction_completed', subjects: 6 },
    ], 30)
    const account = funnel.steps.find(s => s.key === 'account_created')!
    const induction = funnel.steps.find(s => s.key === 'induction_completed')!
    expect(account.subjects).toBe(10)
    expect(account.linkedToPrevious).toBe(false)
    expect(account.conversionPct).toBeNull()
    expect(account.ofStartPct).toBeNull()
    expect(induction.linkedToPrevious).toBe(true)
    expect(induction.conversionPct).toBe(60)
    expect(induction.ofStartPct).toBe(60)
  })
})
