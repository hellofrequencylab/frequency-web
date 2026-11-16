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

import { addToStoredCart, loadCart, mergeGuestIntoStored, removeFromStoredCart, savePrunedCart, setStoredQty, takePaidOutOfStoredCart } from './cart-store'

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

const L = (productId: string, qty = 1, variantId: string | null = null) => ({ productId, variantId, qty })

describe('saving a pruned cart', () => {
  it('drops the lines that were left out and lowers the ones that were lowered', async () => {
    const read = [L('gone'), L('a', 9), L('b', 2)]
    row = { lines: read }
    await savePrunedCart('p1', read, [L('a', 4), L('b', 2)])
    expect(await loadCart('p1')).toEqual([L('a', 4), L('b', 2)])
    expect(upserts).toHaveLength(1)
  })
  it('keeps a line added after the cart was read and never raises or restores one', async () => {
    const read = [L('gone'), L('a', 9), L('b', 2)]
    // Since the read: `b` was removed, `a` was lowered to 1 by the buyer, `new` was added.
    row = { lines: [L('gone'), L('a', 1), L('new', 3)] }
    await savePrunedCart('p1', read, [L('a', 4), L('b', 2)])
    expect(await loadCart('p1')).toEqual([L('a', 1), L('new', 3)])
  })
  it('writes nothing when the stored cart already matches', async () => {
    row = { lines: [L('a', 2)] }
    await savePrunedCart('p1', [L('a', 2)], [L('a', 2)])
    expect(upserts).toHaveLength(0)
  })
})

describe('taking a paid order out of the stored cart', () => {
  it('removes what was paid for and keeps the rest', async () => {
    row = { lines: [L('a', 2), L('b', 3, 'v'), L('c', 1)] }
    await takePaidOutOfStoredCart('p1', [L('a', 2), L('b', 1, 'v')])
    expect(await loadCart('p1')).toEqual([L('b', 2, 'v'), L('c', 1)])
  })
  it('writes nothing when the cart held none of the order', async () => {
    row = { lines: [L('c', 1)] }
    await takePaidOutOfStoredCart('p1', [L('a', 2)])
    expect(upserts).toHaveLength(0)
    row = null
    await takePaidOutOfStoredCart('p1', [L('a', 2)])
    expect(upserts).toHaveLength(0)
  })
})
