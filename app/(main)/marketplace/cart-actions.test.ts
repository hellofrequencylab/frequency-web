import { afterEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({ loadCart: vi.fn(async () => []), addToStoredCart: vi.fn(), setStoredQty: vi.fn(), removeFromStoredCart: vi.fn(), mergeGuestIntoStored: vi.fn(), clearStoredCart: vi.fn() }))
const checkout = vi.hoisted(() => ({ createCommerceCheckout: vi.fn() }))
const cartLoad = vi.hoisted(() => ({ loadCartView: vi.fn() }))
vi.mock('@/lib/commerce/cart-store', () => store)
vi.mock('@/lib/commerce/checkout', () => checkout)
vi.mock('@/lib/commerce/cart-load', () => cartLoad)
vi.mock('@/lib/billing/stripe-browser', () => ({ onPageCheckoutAvailable: () => true }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: vi.fn(async () => 'p1') }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: vi.fn(async () => true) }))

import { addToCartAction, clearCartAction, getCartAction, startCartCheckoutAction } from './cart-actions'

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

describe('checkout from the saved cart', () => {
  const view = { lines: [{ productId: 'a', variantId: null, qty: 2 }, { productId: 'b', variantId: 'v', qty: 1 }], removed: [], reduced: [], totals: [] }
  it('is dark until its own switch is on, even with the cart on', async () => {
    vi.stubEnv('COMMERCE_CART_ENABLED', '1')
    vi.stubEnv('COMMERCE_CART_CHECKOUT_ENABLED', '')
    expect(await startCartCheckoutAction()).toEqual({ error: 'Checkout from your cart is not open yet.' })
    expect(checkout.createCommerceCheckout).not.toHaveBeenCalled()
  })
  it('needs the cart switch too', async () => {
    vi.stubEnv('COMMERCE_CART_ENABLED', '')
    vi.stubEnv('COMMERCE_CART_CHECKOUT_ENABLED', '1')
    expect((await startCartCheckoutAction()).error).toBeTruthy()
    expect(cartLoad.loadCartView).not.toHaveBeenCalled()
  })
  it('pays the priced and pruned lines as the session buyer, on the page when it can', async () => {
    vi.stubEnv('COMMERCE_CART_ENABLED', '1')
    vi.stubEnv('COMMERCE_CART_CHECKOUT_ENABLED', '1')
    cartLoad.loadCartView.mockResolvedValueOnce(view)
    checkout.createCommerceCheckout.mockResolvedValueOnce({ clientSecret: 'cs_secret', sessionId: 'cs_1' })
    expect(await startCartCheckoutAction()).toEqual({ clientSecret: 'cs_secret', sessionId: 'cs_1' })
    expect(checkout.createCommerceCheckout).toHaveBeenCalledWith({
      buyerProfileId: 'p1',
      items: [{ productId: 'a', variantId: null, qty: 2 }, { productId: 'b', variantId: 'v', qty: 1 }],
      ui: 'elements',
    })
  })
  it('asks for the hosted page after a card form failure and passes a refusal through', async () => {
    vi.stubEnv('COMMERCE_CART_ENABLED', '1')
    vi.stubEnv('COMMERCE_CART_CHECKOUT_ENABLED', '1')
    cartLoad.loadCartView.mockResolvedValue(view)
    checkout.createCommerceCheckout.mockResolvedValueOnce({ url: 'https://pay.example/x' })
    expect(await startCartCheckoutAction({ forceHosted: true })).toEqual({ url: 'https://pay.example/x' })
    expect(checkout.createCommerceCheckout.mock.calls[0][0].ui).toBe('hosted')
    checkout.createCommerceCheckout.mockResolvedValueOnce({ error: 'This item is sold out.' })
    expect(await startCartCheckoutAction()).toEqual({ error: 'This item is sold out.' })
  })
  it('refuses an empty cart without calling checkout', async () => {
    vi.stubEnv('COMMERCE_CART_ENABLED', '1')
    vi.stubEnv('COMMERCE_CART_CHECKOUT_ENABLED', '1')
    cartLoad.loadCartView.mockResolvedValueOnce({ ...view, lines: [] })
    expect(await startCartCheckoutAction()).toEqual({ error: 'Your cart is empty.' })
    expect(checkout.createCommerceCheckout).not.toHaveBeenCalled()
  })
  it('empties the cart only through the session profile', async () => {
    vi.stubEnv('COMMERCE_CART_ENABLED', '1')
    expect(await clearCartAction()).toEqual({ ok: true, cart: [] })
    expect(store.clearStoredCart).toHaveBeenCalledWith('p1')
  })
})
