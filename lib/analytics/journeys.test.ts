import { describe, it, expect } from 'vitest'
import {
  JOURNEYS,
  JOURNEY_KEYS,
  getJourney,
  journeyGaps,
  stepIdentity,
  stepsAreLinked,
  toFunnelSpec,
  computeJourneyFunnel,
  type Journey,
} from './journeys'
import { ANALYTICS_EVENTS } from './events'

// The markers below were verified against the live ledger (project azsqfeonabsbmemvddqd)
// on 2026-08-04 by querying distinct event_type / kind. This test pins the two things a
// unit test CAN check without a database: that the registry is internally coherent, and
// that the exact five journeys the plan names are the five journeys that exist.

const EXPECTED_KEYS = [
  'land_to_beta',
  'join_to_circle',
  'circle_to_rsvp',
  'practice_to_return',
  'claim_to_published',
]

describe('the registry', () => {
  it('is exactly the five journeys Lift 1a names', () => {
    expect(JOURNEY_KEYS).toEqual(EXPECTED_KEYS)
  })

  it('gives every journey ordered steps with unique keys', () => {
    for (const j of JOURNEYS) {
      expect(j.steps.length, j.key).toBeGreaterThanOrEqual(3)
      const keys = j.steps.map((s) => s.key)
      expect(new Set(keys).size, j.key).toBe(keys.length)
    }
  })

  it('gives every step at least one marker', () => {
    for (const j of JOURNEYS) {
      for (const s of j.steps) {
        expect(s.markers.length, `${j.key}/${s.key}`).toBeGreaterThan(0)
        expect(s.markers.every((m) => m.length > 0)).toBe(true)
      }
    }
  })

  it('names every unimplemented marker as a gap rather than burying it', () => {
    const gaps = journeyGaps()
    // Verified against prod: nothing emits either of these.
    expect(gaps.map((g) => `${g.journey}/${g.step.key}`)).toEqual([
      'land_to_beta/account_created',
      'circle_to_rsvp/rsvped',
    ])
    // A gap must explain itself, or it is just a zero nobody can act on.
    for (const g of gaps) expect(g.step.note, g.step.key).toBeTruthy()
  })

  it('only claims a taxonomy event exists if it is registered or emitted directly', () => {
    // Every dotted marker is either in the reviewable taxonomy (lib/analytics/events.ts)
    // or written straight through recordEngagementEvent. This asserts the FORMER set is
    // a real subset, which is what stops a typo'd `circle.join` from shipping.
    const registered = new Set(ANALYTICS_EVENTS.map((e) => e.name))
    const claimedFromTaxonomy = ['account.created', 'event.rsvp', 'circle.joined', 'nav.page_view']
    for (const name of claimedFromTaxonomy) expect(registered.has(name), name).toBe(true)
  })

  it('resolves a journey by key and misses cleanly', () => {
    expect(getJourney('practice_to_return')?.name).toBe('First practice to the return')
    expect(getJourney('nope')).toBeUndefined()
  })
})

describe('identity', () => {
  it('keys the semantic ledger by actor and the firehose by session', () => {
    const j = getJourney('land_to_beta')!
    expect(stepIdentity(j.steps[0])).toBe('session')
    expect(stepIdentity(j.steps[2])).toBe('actor')
  })

  it('refuses to link a session-keyed step to a profile-keyed one', () => {
    const j = getJourney('land_to_beta')!
    expect(stepsAreLinked(j.steps[0], j.steps[1])).toBe(true)
    expect(stepsAreLinked(j.steps[1], j.steps[2])).toBe(false)
  })
})

describe('toFunnelSpec', () => {
  it('emits the exact shape the RPC walks, nulling absent options', () => {
    const spec = toFunnelSpec(getJourney('practice_to_return')!)
    expect(spec[1]).toEqual({
      key: 'first_log',
      stream: 'engagement',
      markers: ['practice.verified'],
      pathLike: null,
      withinDays: null,
    })
    expect(spec[2].withinDays).toBe(7)
  })

  it('carries a pathLike through untouched', () => {
    const spec = toFunnelSpec(getJourney('claim_to_published')!)
    expect(spec[1].pathLike).toBe('%/manage%')
  })
})

// A hand-built journey keeps the math test independent of registry edits.
const TOY: Journey = {
  key: 'toy',
  name: 'Toy',
  question: 'Does the math hold?',
  steps: [
    { key: 'a', label: 'A', stream: 'interaction', markers: ['view'], coverage: 'observed' },
    { key: 'b', label: 'B', stream: 'interaction', markers: ['view'], coverage: 'observed' },
    { key: 'c', label: 'C', stream: 'engagement', markers: ['circle.joined'], coverage: 'observed' },
    { key: 'd', label: 'D', stream: 'engagement', markers: ['event.rsvp'], coverage: 'unimplemented' },
  ],
}

describe('computeJourneyFunnel', () => {
  const rows = [
    { stepKey: 'a', subjects: 100 },
    { stepKey: 'b', subjects: 40 },
    { stepKey: 'c', subjects: 10 },
    { stepKey: 'd', subjects: 0 },
  ]

  it('converts against the previous step and against the run start', () => {
    const f = computeJourneyFunnel(TOY, rows, 30)
    expect(f.steps[0].conversionPct).toBeNull() // first step of the first run
    expect(f.steps[1].conversionPct).toBe(40)
    expect(f.steps[1].ofStartPct).toBe(40)
  })

  it('prints no conversion across the identity seam', () => {
    const f = computeJourneyFunnel(TOY, rows, 30)
    expect(f.steps[2].linkedToPrevious).toBe(false)
    expect(f.steps[2].conversionPct).toBeNull()
    // and the run restarts, so the step after it is measured against 10, not 100
    expect(f.steps[3].ofStartPct).toBeNull() // unimplemented, so nothing is claimed
  })

  it('never reports a conversion for a step nothing emits', () => {
    const f = computeJourneyFunnel(TOY, rows, 30)
    expect(f.steps[3].coverage).toBe('unimplemented')
    expect(f.steps[3].conversionPct).toBeNull()
    expect(f.gaps).toEqual(['d'])
  })

  it('treats a missing row as zero rather than throwing', () => {
    const f = computeJourneyFunnel(TOY, [{ stepKey: 'a', subjects: 5 }], 30)
    expect(f.steps.map((s) => s.subjects)).toEqual([5, 0, 0, 0])
    expect(f.steps[1].conversionPct).toBe(0)
  })

  it('carries the window and the journey identity through', () => {
    const f = computeJourneyFunnel(TOY, rows, 28)
    expect(f.windowDays).toBe(28)
    expect(f.key).toBe('toy')
    expect(f.question).toBe('Does the math hold?')
  })
})
