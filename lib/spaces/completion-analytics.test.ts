import { describe, it, expect, vi, beforeEach } from 'vitest'

// SPACE JOURNEY COMPLETION (LIVE-422). Network-free:
//   1. foldSpaceCompletions counts unique people on this Space's plans.
//   2. A re-take does not mint a second start. Finished wins if any row is stamped.
//   3. A row on another plan is ignored.
//   4. getSpaceCompletionAnalytics binds space_id, then plan_id IN those ids.
//   5. Fail-safe: empty spaceId or a thrown read returns zeros, never a throw.

type PlanRow = { id: string }
type EnrollRow = {
  plan_id: string
  profile_id: string
  completed_at: string | null
  order_id: string | null
}

const plans: PlanRow[] = []
const enrollments: EnrollRow[] = []
let planError: { message: string } | null = null
let enrollError: { message: string } | null = null
let failFrom: number | null = null
let rowCap: number | null = null
let missingCount = false
const queries: Array<{ table: string; spaceId?: string; planIds?: string[] }> = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q: { table: string; spaceId?: string; planIds?: string[] } = { table }
      queries.push(q)
      let from = 0
      let to = Number.POSITIVE_INFINITY
      const api = {
        select: () => api,
        eq: (col: string, val: string) => {
          if (col === 'space_id') q.spaceId = val
          return api
        },
        in: (col: string, vals: string[]) => {
          if (col === 'plan_id') q.planIds = vals
          return api
        },
        limit: () => api,
        order: () => api,
        range: (start: number, end: number) => { from = start; to = end; return api },
        then: (resolve: (v: { data: unknown; error: { message: string } | null; count?: number | null }) => void) => {
          if (table === 'journey_plans') {
            return resolve({ data: planError ? null : plans, error: planError, count: missingCount ? null : plans.length })
          }
          if (table === 'journey_enrollments') {
            const ids = new Set(q.planIds ?? [])
            const scoped = enrollments.filter((r) => ids.has(r.plan_id))
            const rows = scoped.slice(from, Math.min(to + 1, rowCap === null ? Number.POSITIVE_INFINITY : from + rowCap))
            const error = enrollError ?? (failFrom !== null && from >= failFrom ? { message: 'later page unavailable' } : null)
            return resolve({ data: error ? null : rows, error, count: missingCount ? null : scoped.length })
          }
          throw new Error(`unexpected table ${table}`)
        },
      }
      return api
    },
  }),
}))

import { foldSpaceCompletions, getSpaceCompletionAnalytics, readSpaceCompletionAnalytics } from './completion-analytics'

const row = (
  plan_id: string,
  profile_id: string,
  completed_at: string | null = null,
  order_id: string | null = null,
): EnrollRow => ({ plan_id, profile_id, completed_at, order_id })

describe('foldSpaceCompletions', () => {
  it('counts unique people on this Space\'s plans, and a re-take is one start', () => {
    const stats = foldSpaceCompletions(
      ['j1', 'j2'],
      [
        row('j1', 'p1'),
        row('j1', 'p1', '2026-09-01T00:00:00.000Z'),
        row('j1', 'p2'),
        row('j2', 'p3', '2026-09-02T00:00:00.000Z', 'ord-1'),
        row('other', 'p9', '2026-09-03T00:00:00.000Z'),
      ],
    )
    expect(stats).toEqual({
      journeyCount: 2,
      enrolled: 3,
      completed: 2,
      inProgress: 1,
      paidEnrolled: 1,
      completionPct: 67,
    })
  })

  it('is zero people and a null rate when no one has started', () => {
    expect(foldSpaceCompletions(['j1'], [])).toEqual({
      journeyCount: 1,
      enrolled: 0,
      completed: 0,
      inProgress: 0,
      paidEnrolled: 0,
      completionPct: null,
    })
  })

  it('counts a Space with no Journeys as empty', () => {
    expect(foldSpaceCompletions([], [row('j1', 'p1')])).toEqual({
      journeyCount: 0,
      enrolled: 0,
      completed: 0,
      inProgress: 0,
      paidEnrolled: 0,
      completionPct: null,
    })
  })
})

describe('getSpaceCompletionAnalytics', () => {
  beforeEach(() => {
    plans.length = 0
    enrollments.length = 0
    queries.length = 0
    planError = null
    enrollError = null
    failFrom = null
    rowCap = null
    missingCount = false
  })

  it('binds the Space, then folds enrollments on those plans', async () => {
    plans.push({ id: 'j1' }, { id: 'j2' })
    enrollments.push(row('j1', 'p1', '2026-09-01T00:00:00.000Z'), row('j2', 'p2'))
    const stats = await getSpaceCompletionAnalytics('space-1')
    expect(stats).toEqual({
      journeyCount: 2,
      enrolled: 2,
      completed: 1,
      inProgress: 1,
      paidEnrolled: 0,
      completionPct: 50,
    })
    expect(queries.some((q) => q.table === 'journey_plans' && q.spaceId === 'space-1')).toBe(true)
    expect(queries.some((q) => q.table === 'journey_enrollments' && q.planIds?.join() === 'j1,j2')).toBe(true)
  })

  it('is a guarded no-op for an empty spaceId', async () => {
    const stats = await getSpaceCompletionAnalytics('')
    expect(stats.enrolled).toBe(0)
    expect(queries).toHaveLength(0)
  })

  it('returns zeros when the plan read fails, and never throws', async () => {
    planError = { message: 'relation is on fire' }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(getSpaceCompletionAnalytics('space-1')).resolves.toEqual({
      journeyCount: 0,
      enrolled: 0,
      completed: 0,
      inProgress: 0,
      paidEnrolled: 0,
      completionPct: null,
    })
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('keeps the Journey count but zeroes the people when the enrollment read fails', async () => {
    plans.push({ id: 'j1' }, { id: 'j2' })
    enrollments.push(row('j1', 'p1', '2026-09-01T00:00:00.000Z'))
    enrollError = { message: 'statement timeout' }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(getSpaceCompletionAnalytics('space-1')).resolves.toEqual({
      journeyCount: 2,
      enrolled: 0,
      completed: 0,
      inProgress: 0,
      paidEnrolled: 0,
      completionPct: null,
    })
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})

describe('availability-aware Frequency completion reader', () => {
  beforeEach(() => { plans.length = 0; enrollments.length = 0; queries.length = 0; planError = null; enrollError = null; failFrom = null; rowCap = null; missingCount = false })
  it('distinguishes measured empty data from a failed read', async () => {
    expect(await readSpaceCompletionAnalytics('space-1')).toMatchObject({ journeyCount: 0, enrolled: 0, completionPct: null })
    planError = { message: 'unavailable' }
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await readSpaceCompletionAnalytics('space-1')).toBeNull()
    log.mockRestore()
  })
  it('does not expose partial enrollment totals after a failed read', async () => {
    plans.push({ id: 'j1' })
    enrollError = { message: 'unavailable' }
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await readSpaceCompletionAnalytics('space-1')).toBeNull()
    log.mockRestore()
  })
  it('reads beyond a single API page while preserving unique-person and owning-Space scope', async () => {
    plans.push({ id: 'j1' })
    for (let i = 0; i < 501; i++) enrollments.push(row('j1', `p${i}`, i === 500 ? '2026-09-01T00:00:00Z' : null))
    enrollments.push(row('j1', 'p0'), row('foreign-plan', 'foreign-person'))
    expect(await readSpaceCompletionAnalytics('space-1')).toMatchObject({ enrolled: 501, completed: 1, inProgress: 500 })
    expect(queries.filter(q => q.table === 'journey_enrollments')).toHaveLength(2)
  })
  it('reports unavailable when the owning plan population exceeds its bounded read', async () => {
    for (let i = 0; i < 201; i++) plans.push({ id: `j${i}` })
    expect(await readSpaceCompletionAnalytics('space-1')).toBeNull()
    expect(queries.some(q => q.table === 'journey_enrollments')).toBe(false)
  })
  it('discards already-read partial people when a later enrollment page fails', async () => {
    plans.push({ id: 'j1' })
    for (let i = 0; i < 501; i++) enrollments.push(row('j1', `p${i}`))
    failFrom = 500
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await readSpaceCompletionAnalytics('space-1')).toBeNull()
    expect(queries.filter(q => q.table === 'journey_enrollments')).toHaveLength(2)
    log.mockRestore()
  })
  it('does not publish bounded partial totals at the maximum enrollment population', async () => {
    plans.push({ id: 'j1' })
    for (let i = 0; i < 10000; i++) enrollments.push(row('j1', `p${i}`))
    expect(await readSpaceCompletionAnalytics('space-1')).toBeNull()
    expect(queries.filter(q => q.table === 'journey_enrollments')).toHaveLength(1)
  })

  it('does not mistake a smaller server row cap for the full population', async () => {
    plans.push({ id: 'j1' })
    rowCap = 100
    for (let i = 0; i < 201; i++) enrollments.push(row('j1', `p${i}`))
    expect(await readSpaceCompletionAnalytics('space-1')).toMatchObject({ enrolled: 201 })
    expect(queries.filter(q => q.table === 'journey_enrollments')).toHaveLength(3)
  })
  it('fails closed when the server cannot prove exact population coverage', async () => {
    missingCount = true
    expect(await readSpaceCompletionAnalytics('space-1')).toBeNull()
  })

})
