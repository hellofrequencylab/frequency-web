import { describe, expect, it } from 'vitest'
import { BUILDER_STEP_EVENTS, type GrowthSnapshot } from './growth'
import { buildUserFlow } from './user-flow'

function snapshot(overrides: Partial<GrowthSnapshot> = {}): GrowthSnapshot {
  return {
    computedAt: '2026-11-13T19:00:00Z', windowDays: 30,
    showingUp: 0, previousShowingUp: 0, guestsShowingUp: 0,
    rsvpEligible: 0, rsvpAttended: 0, firstAttendanceObserved: 0,
    timeToFirstMedianHours: null, timeToFirstP90Hours: null,
    repeatEligible: 0, repeatReturned: 0, newMembers: 0, savedDrafts: 0,
    builderPendingVisits: 0, lastEventAt: '2026-11-13T18:59:00Z',
    weeklyAttendance: Array(8).fill(0), campaigns: [], leadCampaigns: [], recentEvents: [],
    measurement: { eventsInWindow: 0, signupEventsObserved: 0, signupEventsExpected: 0, leadEventsObserved: 0, leadEventsExpected: 0, unattributedSignups: 0, unattributedLeads: 0, futureEventRows: 0 },
    builder: BUILDER_STEP_EVENTS.map((event_type, i) => ({ i: i + 1, event_type, label: event_type, visits: 0, matureVisits: 0 })),
    ...overrides,
  }
}
const builder = (visits: number[], mature: number[]) => BUILDER_STEP_EVENTS.map((event_type, i) => ({ i: i + 1, event_type, label: 'An arbitrary stored label', visits: visits[i], matureVisits: mature[i] }))

describe('user flow interpretation', () => {
  it('keeps Member, lead, anonymous visit, reservation and event populations separate', () => {
    const model = buildUserFlow(snapshot({
      newMembers: 4, rsvpEligible: 1, rsvpAttended: 0,
      leadCampaigns: [{ source: 'email', medium: 'email', campaign: 'private-name', leads: 19, linked_members: 1, eligible: 10, pending: 9, attended: 0 }],
      recentEvents: [
        { event_type: 'nav.page_view', events: 5, latest: '2026-11-13T18:59:00Z' },
        { event_type: 'feature.used', events: 3, latest: '2026-11-13T18:59:00Z' },
      ],
    }))
    expect(model.stages.find((s) => s.key === 'new-members')).toMatchObject({ count: 4, unit: 'people' })
    expect(model.stages.find((s) => s.key === 'leads')).toMatchObject({ count: 19, unit: 'leads' })
    expect(model.stages.find((s) => s.key === 'rsvps')).toMatchObject({ count: 1, unit: 'reservations' })
    expect(model.stages.find((s) => s.key === 'recent-actions')).toMatchObject({ count: 8, unit: 'events', window: 'Last 30 minutes' })
    expect(model.stages.find((s) => s.key === 'arrivals')).toMatchObject({ count: null, state: 'not-measured' })
    expect(model.stages.find((s) => s.key === 'exploring')).toMatchObject({ count: null, state: 'not-measured' })
    expect(model.stages.find((s) => s.key === 'exploring')?.detail).toContain('5 accepted page-view events')
    expect(model.stages.every((s) => !('conversionRate' in s))).toBe(true)
  })
  it('computes continuation only from the same mature nested visitor cohort', () => {
    const model = buildUserFlow(snapshot({
      builder: builder([187, 38, 37, 34, 1, 1], [131, 32, 31, 29, 1, 1]), builderPendingVisits: 56,
    }))
    expect(model.builderSteps[1].continuedRate).toBeCloseTo(32 / 131)
    expect(model.builderSteps[4].continuedRate).toBeCloseTo(1 / 29)
    expect(model.builderSteps[1].lostMatureVisits).toBe(99)
    expect(model.builderSteps[0].pendingVisits).toBe(56)
    expect(model.builderSteps[0].continuedRate).toBeNull()
    expect(model.investigations.some((i) => i.kind === 'measured-friction')).toBe(true)
    expect(model.limitations.join(' ')).toContain('not one identity')
  })
  it('prioritizes missing lead coverage and never calls the observed save gap proven abandonment', () => {
    const base = snapshot()
    const model = buildUserFlow({ ...base,
      savedDrafts: 2,
      builder: builder([187, 38, 37, 34, 1, 1], [131, 32, 31, 29, 1, 1]), builderPendingVisits: 56,
      measurement: { ...base.measurement, leadEventsExpected: 19, leadEventsObserved: 0 },
    })
    expect(model.investigations[0]).toMatchObject({ id: 'lead-coverage', kind: 'coverage', affected: 19 })
    expect(model.investigations.filter((i) => i.id.startsWith('builder-') && i.id !== 'builder-follow-up').every((i) => i.kind === 'weak-signal')).toBe(true)
    expect(model.investigations.find((i) => i.id === 'builder-4')?.guidance).toContain('Reconcile the known source coverage gaps')
    expect(model.investigations.find((i) => i.id === 'builder-4')?.evidence).toContain('1 of 29 visits')
    expect(model.builderSteps[4].continuedRate).toBeCloseTo(1 / 29)
    expect(model.investigations.some((i) => i.kind === 'measured-friction')).toBe(false)
  })
  it('does not classify recent-only cohorts, low samples or no recorded step as proven friction', () => {
    const pending = buildUserFlow(snapshot({ builder: builder([50, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]), builderPendingVisits: 50 }))
    expect(pending.builderSteps.every((s) => s.continuedRate === null)).toBe(true)
    expect(pending.investigations).toContainEqual(expect.objectContaining({ id: 'builder-follow-up', kind: 'follow-up', affected: 50 }))
    expect(pending.investigations.some((i) => i.kind === 'measured-friction')).toBe(false)
    const sparse = buildUserFlow(snapshot({ builder: builder([4, 1, 1, 1, 1, 1], [4, 1, 1, 1, 1, 1]) }))
    expect(sparse.investigations.some((i) => i.id === 'builder-1')).toBe(false)
    const missing = buildUserFlow(snapshot({ builder: builder([40, 0, 0, 0, 0, 0], [40, 0, 0, 0, 0, 0]) }))
    expect(missing.investigations.find((i) => i.id === 'builder-1')?.kind).toBe('weak-signal')
  })
  it('withholds invalid builder comparisons rather than manufacturing rates', () => {
    const model = buildUserFlow(snapshot({ builder: builder([100, 80, 50, 40, 30, 20], [50, 60, 40, 30, 20, 10]), builderPendingVisits: 50 }))
    expect(model.builderSteps).toEqual([])
    expect(model.investigations.some((i) => i.id === 'builder-contract' && i.kind === 'coverage')).toBe(true)
  })
  it('distinguishes zero measured outcomes from absent mature denominators', () => {
    const none = buildUserFlow(snapshot())
    expect(none.stages.find((s) => s.key === 'return')).toMatchObject({ count: null, state: 'not-measured' })
    expect(none.stages.find((s) => s.key === 'rsvp-attendance')).toMatchObject({ count: null, state: 'not-measured' })
    const zero = buildUserFlow(snapshot({ repeatEligible: 40, repeatReturned: 0, rsvpEligible: 40, rsvpAttended: 0 }))
    expect(zero.stages.find((s) => s.key === 'return')).toMatchObject({ count: 0, state: 'observed' })
    expect(zero.investigations.find((i) => i.id === 'attendance-marking')?.kind).toBe('weak-signal')
    expect(zero.investigations.find((i) => i.id === 'attendance-marking')?.evidence).toContain('not proven no-shows')
  })
  it('does not echo identities, free-form event types, campaign names or stored step labels', () => {
    const model = buildUserFlow(snapshot({
      builder: builder([1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1]),
      campaigns: [{ source: 'private@example.com', medium: 'health-topic', campaign: 'Sensitive label', converting_channel: 'private-name', signups: 0, eligible: 0, pending: 0, activated: 0 }],
      recentEvents: [{ event_type: 'private@example.com', events: 2, latest: '2026-11-13T18:59:00Z' }],
    }))
    const text = JSON.stringify(model)
    expect(text).not.toMatch(/private@example|Sensitive label|health-topic|arbitrary stored label/i)
  })
})
