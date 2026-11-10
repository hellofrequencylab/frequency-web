import { afterEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({ loadCart: vi.fn(async () => []), addToStoredCart: vi.fn(), setStoredQty: vi.fn(), removeFromStoredCart: vi.fn(), mergeGuestIntoStored: vi.fn() }))
vi.mock('@/lib/commerce/cart-store', () => store)
vi.mock('@/lib/auth', () => ({ getMyProfileId: vi.fn(async () => 'p1') }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: vi.fn(async () => true) }))

import { addToCartAction, getCartAction } from './cart-actions'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('cart actions', () => {
  it('are dark by default and touch nothing', async () => {
    vi.stubEnv('COMMERCE_CART_ENABLED', '')
    expect(await getCartAction()).toEqual({ ok: false, error: 'off' })
    expect(await addToCartAction('a', null)).toEqual({ ok: false, error: 'off' })
    expect(store.loadCart).not.toHaveBeenCalled()
    expect(store.addToStoredCart).not.toHaveBeenCalled()
  })
  it('read the cart when the switch is on', async () => {
    vi.stubEnv('COMMERCE_CART_ENABLED', 'on')
    expect(await getCartAction()).toEqual({ ok: true, cart: [] })
  })
  it('surface a refused add', async () => {
    vi.stubEnv('COMMERCE_CART_ENABLED', '1')
    store.addToStoredCart.mockResolvedValueOnce({ cart: [], refused: 'cart-full' })
    expect(await addToCartAction('a', null)).toEqual({ ok: false, error: 'cart-full' })
  })
})
