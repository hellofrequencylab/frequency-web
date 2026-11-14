import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({
  primaryReadFails: false,
  rows: [] as Array<Record<string, unknown>>,
  adopted: vi.fn(async () => {}),
  selects: [] as string[],
}))
vi.mock('@/lib/practices', () => ({ adoptPracticesForJourney: state.adopted }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from(table: string) {
  let columns = ''
  const result = () => {
    if (table === 'journey_plan_items') {
      const failed = state.primaryReadFails && columns.startsWith('id,')
      return { data: failed ? null : state.rows, error: failed ? { message: 'Primary read unavailable' } : null }
    }
    return { data: table === 'journey_plans' ? { drip_interval_days: 0, adopt_count: 0, author_id: null } : null, error: null }
  }
  const query = {
    select(value: string) { columns = value; if (table === 'journey_plan_items') state.selects.push(value); return query },
    eq() { return query }, is() { return query }, insert() { return query }, update() { return query }, upsert() { return query },
    maybeSingle: async () => result(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  }
  return query
} }) }))
import { adoptPlan, adoptPlanForRunMembers } from './journey-plans'

function row(id: string, required: boolean, settings: Record<string, boolean> | null, parent: string | null = 'phase') {
  return { id, parent_id: parent, block_type: 'practice', sort_order: 1, title: id, required, est_minutes: null, practice_id: id, settings }
}
beforeEach(() => {
  vi.clearAllMocks()
  state.primaryReadFails = false
  state.selects.length = 0
  state.rows = [
    { id: 'phase', parent_id: null, block_type: 'phase', sort_order: 0, title: 'Week', required: true, est_minutes: null, practice_id: null, settings: null },
    row('anchor', true, { anchor: true }),
    row('suggested', false, { support_suggestion: true }),
    row('legacy-optional', false, null),
  ]
})

describe('real enrollment respects prospective optional support rows', () => {
  it('passes only the anchor and unchanged legacy optional row into cohort adoption', async () => {
    await adoptPlanForRunMembers(['member'], 'plan')
    expect(state.adopted).toHaveBeenCalledWith(['member'], ['anchor', 'legacy-optional'], 'plan')
  })
  it('retains optionality through the non-strict failed-read fallback', async () => {
    state.primaryReadFails = true
    await adoptPlanForRunMembers(['member'], 'plan')
    expect(state.selects).toContain('practice_id, required, settings')
    expect(state.adopted).toHaveBeenCalledWith(['member'], ['anchor', 'legacy-optional'], 'plan')
  })
  it('retains optionality through strict enrollment with a legacy unplayable root module', async () => {
    state.rows[0].block_type = 'module'
    await adoptPlan('member', 'plan', { strict: true })
    expect(state.adopted).toHaveBeenCalledWith(['member'], ['anchor', 'legacy-optional'], 'plan', { strict: true })
  })
})
