import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ error: null as { message: string } | null, thrown: null as Error | null, updates: [] as unknown[] }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ update(value: unknown) {
  state.updates.push(value)
  return { eq: async () => { if (state.thrown) throw state.thrown; return { error: state.error } } }
} }) }) }))
import { cancelBookingByOrder } from './booking'
beforeEach(() => { state.error = null; state.thrown = null; state.updates = [] })
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
