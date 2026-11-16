import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommerceProduct, CommerceVariant } from './types'

const store = vi.hoisted(() => ({ loadCart: vi.fn(), savePrunedCart: vi.fn() }))
const products = vi.hoisted(() => ({ getProductsStrict: vi.fn() }))
const variants = vi.hoisted(() => ({ getVariantsByIds: vi.fn() }))
vi.mock('./cart-store', () => store)
vi.mock('./products', () => products)
vi.mock('./variants', () => variants)

import { loadCartView } from './cart-load'

const product = (o: Partial<CommerceProduct> & { id: string }): CommerceProduct =>
  ({ title: o.id, images: [], priceCents: 1000, currency: 'usd', stock: null, status: 'active', ...o }) as CommerceProduct
const L = (productId: string, qty = 1, variantId: string | null = null) => ({ productId, variantId, qty })

beforeEach(() => {
  vi.clearAllMocks()
  store.savePrunedCart.mockResolvedValue(undefined)
  variants.getVariantsByIds.mockResolvedValue(new Map<string, CommerceVariant>())
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('loadCartView', () => {
  it('saves the cart the buyer is shown when a line was left out or lowered, and still says what changed', async () => {
    const cart = [L('gone'), L('a', 9), L('b', 2)]
    store.loadCart.mockResolvedValue(cart)
    products.getProductsStrict.mockResolvedValue(new Map([['a', product({ id: 'a', stock: 4 })], ['b', product({ id: 'b' })]]))
    const view = await loadCartView('p1')
    expect(view.removed).toEqual(['gone:'])
    expect(view.reduced).toEqual([{ key: 'a:', from: 9, to: 4 }])
    expect(store.savePrunedCart).toHaveBeenCalledWith('p1', cart, [L('a', 4), L('b', 2)])
  })
  it('writes nothing when every line is still for sale as saved', async () => {
    store.loadCart.mockResolvedValue([L('a', 2)])
    products.getProductsStrict.mockResolvedValue(new Map([['a', product({ id: 'a' })]]))
    const view = await loadCartView('p1')
    expect(view.lines).toHaveLength(1)
    expect(store.savePrunedCart).not.toHaveBeenCalled()
  })
  it('reads products and variants strictly, so a failed read throws instead of emptying the cart', async () => {
    store.loadCart.mockResolvedValue([L('a', 1, 'v1')])
    products.getProductsStrict.mockRejectedValue(new Error('[commerce] product read failed: timeout'))
    await expect(loadCartView('p1')).rejects.toThrow('product read failed')
    expect(variants.getVariantsByIds).toHaveBeenCalledWith(['v1'], { strict: true })
    expect(store.savePrunedCart).not.toHaveBeenCalled()
  })
  it('still answers with the view when the save fails, and logs it', async () => {
    store.loadCart.mockResolvedValue([L('gone')])
    products.getProductsStrict.mockResolvedValue(new Map())
    store.savePrunedCart.mockRejectedValue(new Error('[cart] save failed: down'))
    const view = await loadCartView('p1')
    expect(view.removed).toEqual(['gone:'])
    expect(console.error).toHaveBeenCalled()
  })
})
