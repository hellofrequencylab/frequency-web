import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ sync: vi.fn(), suggestion: true }))
vi.mock('@/lib/practices', () => ({ syncJourneyAdoptionRows: state.sync }))
vi.mock('@/lib/journeys/runs', () => ({ getMemberRunForPlan: async () => null, getSoloEnrollmentStart: async () => null }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from(table: string) {
  const rows = () => {
    if (table === 'journey_plan_adoptions') return [{ plan_id: 'plan' }]
    if (table === 'journey_enrollments') return [{ plan_id: 'plan', run_id: null, completed_at: null }]
    if (table === 'journey_plan_items') return [
      { id: 'phase', parent_id: null, block_type: 'phase', sort_order: 0, title: 'Week', required: true },
      { id: 'anchor', parent_id: 'phase', block_type: 'practice', sort_order: 0, title: 'Anchor', practice_id: 'anchor-practice', required: true, settings: { anchor: true } },
      { id: 'optional', parent_id: 'phase', block_type: 'practice', sort_order: 1, title: 'Support', practice_id: 'optional-practice', required: false, settings: state.suggestion ? { support_suggestion: true } : null },
    ]
    return []
  }
  const query = {
    select: () => query, eq: () => query, in: () => query,
    maybeSingle: async () => ({ data: { title: 'My Journey', drip_interval_days: 0 }, error: null }),
    then: (resolve: (value: unknown) => unknown) => resolve({ data: rows(), error: null }),
  }
  return query
} }) }))
import { getCurrentLeg } from './current-leg'
beforeEach(() => { vi.clearAllMocks(); state.suggestion = true })
it('passes the actual stored prospective marker through the On Air reader and rollover reconciliation', async () => {
  expect(await getCurrentLeg('member')).toMatchObject({ practiceIds: ['anchor-practice'], legs: [{ planId: 'plan', week: null, weeks: 1 }] })
  expect(state.sync).toHaveBeenCalledWith('member', 'plan', ['anchor-practice'])
})
it('keeps stored unmarked legacy optional practice targets and does not retroactively retire them', async () => {
  state.suggestion = false
  expect((await getCurrentLeg('member')).practiceIds).toEqual(['anchor-practice', 'optional-practice'])
  expect(state.sync).toHaveBeenCalledWith('member', 'plan', ['anchor-practice', 'optional-practice'])
})
