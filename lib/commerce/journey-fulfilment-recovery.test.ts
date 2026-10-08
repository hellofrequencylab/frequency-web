import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ errorAt: '', orderId: 'o1', verified: true, filters: [] as unknown[][], adopt: vi.fn(async () => {}) }))
vi.mock('@/lib/journey-plans', () => ({ adoptPlan: state.adopt }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from(table: string) {
  let op = 'select'
  const result = () => ({ error: state.errorAt === `${table}:${op}` ? { message: 'temporary database failure' } : null,
    data: table === 'commerce_orders' ? { buyer_profile_id: 'buyer' } : table === 'commerce_order_items' ? [{ product: { journey_plan_id: 'journey' } }]
      : state.verified ? { id: 'enrollment', order_id: state.orderId } : null })
  const builder = { select() { return builder }, eq() { return builder }, is() { return builder },
    or(...args: unknown[]) { state.filters.push(args); return builder },
    update() { op = 'update'; return builder }, maybeSingle: async () => result(),
    then(resolve: (value: unknown) => unknown) { return Promise.resolve(result()).then(resolve) } }
  return builder
} }) }))
import { enrolByOrder } from './journey-fulfilment'
beforeEach(() => { state.errorAt = ''; state.orderId = 'o1'; state.verified = true; state.filters.length = 0; state.adopt.mockReset(); state.adopt.mockResolvedValue(undefined) })
describe('required paid Journey access', () => {
  it.each(['commerce_orders:select', 'commerce_order_items:select'])('never checkpoints the silent failure at %s', async (point) => {
    state.errorAt = point
    await expect(enrolByOrder('o1', { strict: true })).rejects.toMatchObject({ message: 'temporary database failure' })
    state.errorAt = ''
    await expect(enrolByOrder('o1', { strict: true })).resolves.toBeUndefined()
  })
  it('delegates both access writes to the canonical paid-order grant rather than stamping later', async () => {
    await enrolByOrder('o1', { strict: true })
    expect(state.filters).toEqual([])
    expect(state.adopt).toHaveBeenLastCalledWith('buyer', 'journey', { strict: true, paidOrderId: 'o1' })
  })
  it('propagates canonical adoption failure for replay while the default caller stays fail-soft', async () => {
    state.adopt.mockRejectedValue(new Error('practice adoption failed'))
    await expect(enrolByOrder('o1', { strict: true })).rejects.toThrow('practice adoption failed')
    await expect(enrolByOrder('o1')).resolves.toBeUndefined()
  })
})
