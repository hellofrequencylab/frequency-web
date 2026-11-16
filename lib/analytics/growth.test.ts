import { describe, expect, it } from 'vitest'
import { BUILDER_STEP_EVENTS, campaignCsv, growthAiEvidence, growthExperiments, growthHealth, growthSnapshotSchema, measuredRate, type GrowthSnapshot } from './growth'

export const sampleGrowth: GrowthSnapshot = {
  computedAt: '2026-11-12T23:00:00+00:00', windowDays: 30,
  showingUp: 7, previousShowingUp: 4, repeatEligible: 0, repeatReturned: 0,
  guestsShowingUp: 0, rsvpEligible: 0, rsvpAttended: 0,
  timeToFirstMedianHours: null, timeToFirstP90Hours: null, firstAttendanceObserved: 0,
  newMembers: 0, savedDrafts: 2, lastEventAt: null,
  builderPendingVisits: 0,
  measurement: { eventsInWindow: 0, signupEventsObserved: 0, signupEventsExpected: 0, leadEventsObserved: 0, leadEventsExpected: 0, unattributedSignups: 0, unattributedLeads: 0, futureEventRows: 0 },
  weeklyAttendance: [0, 0, 0, 0, 1, 2, 4, 7], campaigns: [], leadCampaigns: [], recentEvents: [], builder: BUILDER_STEP_EVENTS.map((key, i) => ({ i: i + 1, label: key, event_type: key, visits: 0, matureVisits: 0 })),
}

describe('growth measurement contracts', () => {
  it('distinguishes zero outcomes from an unmeasured denominator', () => {
    expect(measuredRate(0, 20)).toBe(0)
    expect(measuredRate(0, 0)).toBeNull()
    expect(measuredRate(21, 20)).toBeNull()
    expect(measuredRate(NaN, 20)).toBeNull()
    expect(measuredRate(-1, 20)).toBeNull()
  })
  it('rejects partial or inconsistent database readings', () => {
    expect(growthSnapshotSchema.safeParse(sampleGrowth).success).toBe(true)
    expect(growthSnapshotSchema.safeParse({}).success).toBe(false)
    expect(growthSnapshotSchema.safeParse({ ...sampleGrowth, builder: [] }).success).toBe(false)
    expect(growthSnapshotSchema.safeParse({ ...sampleGrowth, builder: [...sampleGrowth.builder].reverse() }).success).toBe(false)
    expect(growthSnapshotSchema.safeParse({ ...sampleGrowth, lastEventAt: '2026-11-13T00:00:00Z' }).success).toBe(false)
    expect(growthSnapshotSchema.safeParse({ ...sampleGrowth, repeatReturned: 3 }).success).toBe(false)
    expect(growthSnapshotSchema.safeParse({ ...sampleGrowth, campaigns: [{ source: 'email', medium: 'email', campaign: 'x', converting_channel: 'email', signups: 2, eligible: 1, pending: 1, activated: 2 }] }).success).toBe(false)
  })
  it('does not propose changes from sparse evidence', () => {
    expect(growthExperiments(sampleGrowth)).toEqual([])
    expect(growthExperiments({ ...sampleGrowth, repeatEligible: 2 })).toEqual([])
  })
  it('proposes a test with evidence and a full follow-up, never a claimed uplift', () => {
    const [proposal] = growthExperiments({ ...sampleGrowth, repeatEligible: 40, repeatReturned: 4 })
    expect(proposal.id).toBe('attendance-return')
    expect(proposal.evidence).toContain('4 of 40')
    expect(proposal.evaluation).toContain('28-day')
    expect(proposal.guardrails).toContain('Consent')
  })
  it('keeps arbitrary campaign names, event types and private data out of model evidence', () => {
    const evidence = growthAiEvidence({ ...sampleGrowth, campaigns: [{ source: 'private@example.com', medium: 'email', campaign: 'grief topic', converting_channel: 'email', signups: 3, eligible: 2, pending: 1, activated: 1 }] })
    const serialized = JSON.stringify(evidence)
    expect(serialized).not.toContain('private@example.com')
    expect(serialized).not.toContain('grief')
    expect(evidence.showingUp).toBe(7)
  })
  it('exports quoted campaign aggregates with spreadsheet formula protection and blank unknown spend', () => {
    const csv = campaignCsv({ ...sampleGrowth, campaigns: [{ source: '=HYPERLINK("unsafe")', medium: 'email', campaign: 'launch,"one"', converting_channel: 'unknown', signups: 5, eligible: 3, pending: 2, activated: 1 }] })
    expect(csv).toContain('"\'=HYPERLINK(""unsafe"")"')
    expect(csv).toContain('"launch,""one"""')
    expect(csv.split('\r\n')).toHaveLength(2)
    expect(csv).toMatch(/,""$/)
    expect(csv).toContain('\r\n')
  })
})


describe('growth follow-up and health', () => {
  it('does not turn recently opened builder visits into failed seven-day outcomes', () => {
    const builder = sampleGrowth.builder.map((step, i) => ({ ...step, visits: i === 0 ? 50 : 0 }))
    expect(growthExperiments({ ...sampleGrowth, builder, builderPendingVisits: 50 })).toEqual([])
    const mature = builder.map((step) => ({ ...step, matureVisits: step.visits }))
    expect(growthExperiments({ ...sampleGrowth, builder: mature, builderPendingVisits: 0 })[0].evidence).toContain('full seven-day follow-up')
  })
  it('distinguishes no event baseline from evidence of broken tracking', () => {
    const health = growthHealth(sampleGrowth, Date.parse(sampleGrowth.computedAt))
    expect(health.state).toBe('unknown')
    expect(health.alerts[0].id).toBe('no-event-baseline')
    expect(health.alerts[0].detail).toContain('controlled action')
  })
  it('reports coverage gaps and stale readings without inventing drop-off or attributing missing data to consent', () => {
    const health = growthHealth({ ...sampleGrowth, measurement: { ...sampleGrowth.measurement, signupEventsExpected: 4, signupEventsObserved: 1, futureEventRows: 2 } }, Date.parse(sampleGrowth.computedAt) + 180_000)
    expect(health.state).toBe('watch')
    expect(health.alerts.map((a) => a.id)).toEqual(expect.arrayContaining(['signup-coverage', 'stale-reading', 'future-events']))
    expect(health.alerts.find((a) => a.id === 'signup-coverage')?.detail).toContain('not treat this as measured abandonment')
  })
  it('neutralizes formulas after spaces, tabs and line breaks in exported campaign labels', () => {
    for (const source of [' =1+1', '\t@SUM(1)', '\r\n+1', '  -1']) {
      const csv = campaignCsv({ ...sampleGrowth, campaigns: [{ source, medium: 'email', campaign: 'launch', converting_channel: 'unknown', signups: 1, eligible: 1, pending: 0, activated: 0 }] })
      expect(csv).toContain(`"'${source}"`)
    }
  })
})
