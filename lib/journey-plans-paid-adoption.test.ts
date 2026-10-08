import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ refuse: '', grantState: 'granted', grantCalls: [] as unknown[], practices: vi.fn(async () => {}), writes: [] as string[] }))
vi.mock('@/lib/practices', () => ({ adoptPracticesForJourney: state.practices }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: async (_name: string, args: unknown) => { state.grantCalls.push(args); return { data: { state: state.grantState, new_adoption: false }, error: null } }, from(table: string) {
  let op = 'select'
  const result = () => ({ error: state.refuse === `${table}:${op}` ? { message: 'temporary access write failure' } : null,
    data: table === 'journey_plans' ? { drip_interval_days: 7, adopt_count: 0, author_id: null } : table === 'journey_plan_items' ? [] : null })
  const builder = { select() { return builder }, eq() { return builder }, is() { return builder },
    insert() { op = 'insert'; state.writes.push(`${table}:${op}`); return builder },
    update() { op = 'update'; state.writes.push(`${table}:${op}`); return builder },
    maybeSingle: async () => result(), then(resolve: (value: unknown) => unknown) { return Promise.resolve(result()).then(resolve) } }
  return builder
} }) }))
import { adoptPlan } from './journey-plans'
beforeEach(() => { state.refuse = ''; state.grantState = 'granted'; state.grantCalls.length = 0; state.writes.length = 0; state.practices.mockReset(); state.practices.mockResolvedValue(undefined) })
describe('the canonical adoption path can report required paid-access failures', () => {
  it.each(['journey_enrollments:select', 'journey_plan_items:select', 'journey_plans:select', 'journey_enrollments:insert', 'journey_plan_adoptions:select', 'journey_plan_adoptions:insert'])('retries %s instead of pretending access landed', async (point) => {
    state.refuse = point
    await expect(adoptPlan('buyer', 'journey', { strict: true })).rejects.toMatchObject({ message: 'temporary access write failure' })
    state.refuse = ''
    await expect(adoptPlan('buyer', 'journey', { strict: true })).resolves.toBeUndefined()
    expect(state.writes).toContain('journey_enrollments:insert')
    expect(state.writes).toContain('journey_plan_adoptions:insert')
  })
  it('requires practice adoption to finish under the same strict contract', async () => {
    state.practices.mockRejectedValueOnce(new Error('practice storage unavailable'))
    await expect(adoptPlan('buyer', 'journey', { strict: true })).rejects.toThrow('practice storage unavailable')
    await adoptPlan('buyer', 'journey', { strict: true })
    expect(state.practices).toHaveBeenLastCalledWith(['buyer'], [], 'journey', { strict: true })
  })
})


describe('canonical paid adoption commits permission only through the locked RPC', () => {
  it('never creates a separate unprovenanced enrollment or active legacy adoption before the grant', async () => {
    await adoptPlan('buyer', 'journey', { paidOrderId: 'o1' })
    expect(state.writes).toEqual([])
    expect(state.grantCalls).toEqual([{ _order: 'o1', _plan: 'journey', _profile: 'buyer' }])
    expect(state.practices).toHaveBeenCalledWith(['buyer'], [], 'journey', { paidOrderId: 'o1', strict: true })
  })
  it('a refund winning during preparation cannot leave a temporary lesson permission', async () => {
    state.practices.mockImplementationOnce(async () => { state.grantState = 'refused' })
    await expect(adoptPlan('buyer', 'journey', { paidOrderId: 'o1' })).rejects.toThrow('grant was refused')
    expect(state.writes).toEqual([])
  })
})
