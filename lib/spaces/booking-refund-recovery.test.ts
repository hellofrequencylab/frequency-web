import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ error: null as { message: string } | null, thrown: null as Error | null, updates: [] as unknown[], confirmation: true, calls: [] as unknown[] }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: async (name: string, args: unknown) => { state.calls.push([name,args]); if(state.thrown)throw state.thrown; return {data:state.confirmation,error:state.error} }, from: () => ({ update(value: unknown) {
  state.updates.push(value)
  return { eq: async () => { if (state.thrown) throw state.thrown; return { error: state.error } } }
} }) }) }))
import { cancelBookingByOrder, confirmBookingByOrder } from './booking'
beforeEach(() => { state.error = null; state.thrown = null; state.updates = []; state.calls = []; state.confirmation = true })
describe('required full-refund booking cancellation', () => {
  it('rejects a returned database failure, then repairs it on replay', async () => {
    state.error = { message: 'database offline' }
    await expect(cancelBookingByOrder('order', { strict: true })).rejects.toThrow('database offline')
    state.error = null
    await expect(cancelBookingByOrder('order', { strict: true })).resolves.toBeUndefined()
    expect(state.updates).toEqual([{ status: 'cancelled' }, { status: 'cancelled' }])
  })
  it('rejects thrown transport failures only for the strict recovery caller', async () => {
    state.thrown = new Error('transport offline')
    await expect(cancelBookingByOrder('order', { strict: true })).rejects.toThrow('transport offline')
    await expect(cancelBookingByOrder('order')).resolves.toBeUndefined()
  })
})

describe('paid booking confirmation authority', () => {
  it('uses the atomic paid order RPC and refuses a refunded order without direct booking updates', async () => {
    state.confirmation = false
    await expect(confirmBookingByOrder('refunded', { strict: true })).rejects.toThrow('paid order refused')
    expect(state.calls).toEqual([['confirm_paid_commerce_booking', { _order: 'refunded' }]])
    expect(state.updates).toEqual([])
  })
  it('accepts successful paid/no-booking RPC results and propagates transport failure', async () => {
    await expect(confirmBookingByOrder('paid', { strict: true })).resolves.toBeUndefined()
    state.thrown = new Error('authority unavailable')
    await expect(confirmBookingByOrder('paid', { strict: true })).rejects.toThrow('authority unavailable')
  })
})
