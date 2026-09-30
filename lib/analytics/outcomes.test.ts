import { describe, it, expect } from 'vitest'
import { completionRate, computeJourneyOutcomes, fillRate, getOutcomeReport } from './outcomes'

describe('completionRate', () => {
  it('rounds completed/started to a percent', () => {
    expect(completionRate(4, 1)).toBe(25)
    expect(completionRate(3, 3)).toBe(100)
    expect(completionRate(8, 1)).toBe(13)
  })
  it('is null when nothing started (no divide-by-zero)', () => {
    expect(completionRate(0, 0)).toBeNull()
  })
})

describe('fillRate', () => {
  it('is count/cap as a percent', () => {
    expect(fillRate(6, 12)).toBe(50)
    expect(fillRate(12, 12)).toBe(100)
  })
  it('is null when uncapped', () => {
    expect(fillRate(5, null)).toBeNull()
    expect(fillRate(5, 0)).toBeNull()
  })
})

// ── Per-Journey completion (LIVE-687) ───────────────────────────────────────────
// Fixture rows shaped like the live tables: journey_enrollments (a take), journey_completions
// (the canonical finish) and journey_lesson_progress (a checked-off lesson).
const PLANS = [
  { id: 'p-breath', title: 'Breath Basics' },
  { id: 'p-cold', title: 'Cold Start' },
  { id: 'p-idle', title: 'Nobody Took This' },
]
const TAKES = [
  { plan_id: 'p-breath', profile_id: 'ana' },
  { plan_id: 'p-breath', profile_id: 'ben' },
  { plan_id: 'p-breath', profile_id: 'cy' },
  { plan_id: 'p-breath', profile_id: 'dee' },
  // ana took it again in a Circle Run: still one member.
  { plan_id: 'p-breath', profile_id: 'ana' },
  { plan_id: 'p-cold', profile_id: 'ben' },
]
const FINISHES = [
  { journey_id: 'p-breath', profile_id: 'ana' },
  // ana finished again in a later season: still one finisher.
  { journey_id: 'p-breath', profile_id: 'ana' },
  // eve finished and then left (her take row is gone): she still counts as a taker.
  { journey_id: 'p-cold', profile_id: 'eve' },
]
const CHECKS = [
  { plan_id: 'p-breath', profile_id: 'ben' },
  { plan_id: 'p-breath', profile_id: 'ben' },
  { plan_id: 'p-breath', profile_id: 'cy' },
  { plan_id: 'p-breath', profile_id: 'ana' },
]

describe('computeJourneyOutcomes', () => {
  it('counts distinct takers and finishers per Journey', () => {
    const out = computeJourneyOutcomes(PLANS, TAKES, FINISHES, CHECKS)
    expect(out.map((q) => q.name)).toEqual(['Breath Basics', 'Cold Start'])
    const breath = out[0]
    expect(breath).toMatchObject({ id: 'p-breath', started: 4, completed: 1, rate: 25 })
    const cold = out[1]
    expect(cold).toMatchObject({ id: 'p-cold', started: 2, completed: 1, rate: 50 })
  })

  it('averages the lesson step the unfinished takers are on', () => {
    const [breath, cold] = computeJourneyOutcomes(PLANS, TAKES, FINISHES, CHECKS)
    // ben 2 lessons (step 3), cy 1 (step 2), dee 0 (step 1): (3 + 2 + 1) / 3 = 2. ana finished.
    expect(breath.avgStallStep).toBe(2)
    // ben has checked nothing in Cold Start: step 1. eve finished.
    expect(cold.avgStallStep).toBe(1)
  })

  it('has no stall step when every taker finished', () => {
    const [only] = computeJourneyOutcomes(PLANS, [{ plan_id: 'p-cold', profile_id: 'eve' }], [{ journey_id: 'p-cold', profile_id: 'eve' }])
    expect(only).toMatchObject({ started: 1, completed: 1, rate: 100, avgStallStep: null })
  })

  it('leaves out Journeys nobody took, and is empty with no takes', () => {
    expect(computeJourneyOutcomes(PLANS, TAKES, FINISHES).some((q) => q.id === 'p-idle')).toBe(false)
    expect(computeJourneyOutcomes(PLANS, [], [])).toEqual([])
  })
})

// A stand-in for the admin client: every read of a table answers with that table's
// fixture rows, honouring .range() so the page loop is exercised.
function fakeDb(tables: Record<string, unknown[]>) {
  const reads: string[] = []
  const db = {
    reads,
    rpc: async () => ({ data: [], error: null }),
    from(table: string) {
      reads.push(table)
      let lo = 0
      let hi = Number.MAX_SAFE_INTEGER
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        range: (a: number, b: number) => {
          lo = a
          hi = b
          return q
        },
        then: (res: (v: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: (tables[table] ?? []).slice(lo, hi + 1), error: null }).then(res),
      }
      return q
    },
  }
  return db
}

describe('getOutcomeReport Journeys section', () => {
  it('fills the Journeys section from the take and finish tables', async () => {
    const db = fakeDb({
      journey_enrollments: TAKES,
      journey_completions: FINISHES,
      journey_plans: PLANS,
      journey_lesson_progress: CHECKS,
    })
    const report = await getOutcomeReport(db as never)
    expect(report.quests.map((q) => [q.name, q.started, q.completed, q.rate])).toEqual([
      ['Breath Basics', 4, 1, 25],
      ['Cold Start', 2, 1, 50],
    ])
  })

  it('reads past the first 1,000 takes', async () => {
    const many = Array.from({ length: 1500 }, (_, i) => ({ plan_id: 'p-breath', profile_id: `m${i}` }))
    const db = fakeDb({ journey_enrollments: many, journey_completions: [], journey_plans: PLANS })
    const report = await getOutcomeReport(db as never)
    expect(report.quests[0]).toMatchObject({ name: 'Breath Basics', started: 1500, completed: 0 })
  })

  it('skips the plan reads when nobody has taken a Journey', async () => {
    const db = fakeDb({ journey_plans: PLANS })
    const report = await getOutcomeReport(db as never)
    expect(report.quests).toEqual([])
    expect(db.reads).not.toContain('journey_plans')
  })
})
