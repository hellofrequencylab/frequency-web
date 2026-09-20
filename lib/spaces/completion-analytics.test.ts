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
const queries: Array<{ table: string; spaceId?: string; planIds?: string[] }> = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q: { table: string; spaceId?: string; planIds?: string[] } = { table }
      queries.push(q)
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
        then: (resolve: (v: { data: unknown; error: { message: string } | null }) => void) => {
          if (table === 'journey_plans') {
            return resolve({ data: planError ? null : plans, error: planError })
          }
          if (table === 'journey_enrollments') {
            const ids = new Set(q.planIds ?? [])
            const rows = enrollments.filter((r) => ids.has(r.plan_id))
            return resolve({ data: enrollError ? null : rows, error: enrollError })
          }
          throw new Error(`unexpected table ${table}`)
        },
      }
      return api
    },
  }),
}))

import { foldSpaceCompletions, getSpaceCompletionAnalytics } from './completion-analytics'

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
})
