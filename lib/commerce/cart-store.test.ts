import { beforeEach, describe, expect, it, vi } from 'vitest'

let row: { lines: unknown } | null = null
const upserts: unknown[] = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      upsert: async (v: { lines: unknown }) => {
        upserts.push(v)
        row = { lines: v.lines }
        return { error: null }
      },
    }),
  }),
}))

import { addToStoredCart, loadCart, mergeGuestIntoStored, removeFromStoredCart, setStoredQty } from './cart-store'

beforeEach(() => {
  row = null
  upserts.length = 0
})

describe('cart store', () => {
  it('reads a missing row as an empty cart and a malformed one as clean lines', async () => {
    expect(await loadCart('p1')).toEqual([])
    row = { lines: [{ productId: 'a', variantId: null, qty: 2 }, { nope: true }, 'x'] }
    expect(await loadCart('p1')).toEqual([{ productId: 'a', variantId: null, qty: 2 }])
  })
  it('adds, sets, removes and persists each change', async () => {
    await addToStoredCart('p1', { productId: 'a', variantId: null, qty: 1 })
    await addToStoredCart('p1', { productId: 'a', variantId: null, qty: 2 })
    expect(await loadCart('p1')).toEqual([{ productId: 'a', variantId: null, qty: 3 }])
    await setStoredQty('p1', 'a:', 5)
    expect((await loadCart('p1'))[0].qty).toBe(5)
    await removeFromStoredCart('p1', 'a:')
    expect(await loadCart('p1')).toEqual([])
  })
  it('refuses a bad quantity without writing', async () => {
    const r = await addToStoredCart('p1', { productId: 'a', variantId: null, qty: 0 })
    expect(r.refused).toBe('invalid-qty')
    expect(upserts).toHaveLength(0)
  })
  it('merges an untrusted guest cart, signed-in lines first', async () => {
    row = { lines: [{ productId: 'a', variantId: null, qty: 1 }] }
    const merged = await mergeGuestIntoStored('p1', [{ productId: 'b', variantId: null, qty: 1 }, { productId: 'a', variantId: null, qty: 2 }, 7])
    expect(merged).toEqual([{ productId: 'a', variantId: null, qty: 3 }, { productId: 'b', variantId: null, qty: 1 }])
  })
})
