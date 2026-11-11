import { describe, expect, it } from 'vitest'
import { buildCartView } from './cart-view'
import type { CommerceProduct, CommerceVariant } from './types'

const product = (o: Partial<CommerceProduct> & { id: string }): CommerceProduct =>
  ({ title: o.id, images: [], priceCents: 1000, currency: 'usd', stock: null, status: 'active', ...o }) as CommerceProduct
const variant = (o: Partial<CommerceVariant> & { id: string; productId: string }): CommerceVariant =>
  ({ name: 'Large', priceCents: null, stock: null, active: true, ...o }) as CommerceVariant

describe('buildCartView', () => {
  it('prices a line from the live product row and totals per currency', () => {
    const v = buildCartView([{ productId: 'a', variantId: null, qty: 3 }], new Map([['a', product({ id: 'a', priceCents: 1250 })]]), new Map())
    expect(v.lines[0]).toMatchObject({ unitCents: 1250, lineCents: 3750, max: null })
    expect(v.totals).toEqual([{ currency: 'usd', cents: 3750 }])
  })

  it('uses the variant price when it has one and the product price when it inherits', () => {
    const products = new Map([['a', product({ id: 'a', priceCents: 1000 })]])
    const variants = new Map([
      ['v1', variant({ id: 'v1', productId: 'a', priceCents: 1800 })],
      ['v2', variant({ id: 'v2', productId: 'a' })],
    ])
    const v = buildCartView(
      [
        { productId: 'a', variantId: 'v1', qty: 1 },
        { productId: 'a', variantId: 'v2', qty: 1 },
      ],
      products,
      variants,
    )
    expect(v.lines.map((l) => l.unitCents)).toEqual([1800, 1000])
    expect(v.lines[0].variantName).toBe('Large')
  })

  it('drops a product that is gone, archived or sold out and says so', () => {
    const v = buildCartView(
      [
        { productId: 'gone', variantId: null, qty: 1 },
        { productId: 'old', variantId: null, qty: 1 },
        { productId: 'out', variantId: null, qty: 1 },
        { productId: 'ok', variantId: null, qty: 1 },
      ],
      new Map([
        ['old', product({ id: 'old', status: 'archived' })],
        ['out', product({ id: 'out', stock: 0 })],
        ['ok', product({ id: 'ok' })],
      ]),
      new Map(),
    )
    expect(v.lines.map((l) => l.productId)).toEqual(['ok'])
    expect(v.removed).toEqual(['gone:', 'old:', 'out:'])
  })

  it('clamps to stock on hand and reports it', () => {
    const v = buildCartView([{ productId: 'a', variantId: null, qty: 9 }], new Map([['a', product({ id: 'a', stock: 4 })]]), new Map())
    expect(v.lines[0]).toMatchObject({ qty: 4, max: 4 })
    expect(v.reduced).toEqual([{ key: 'a:', from: 9, to: 4 }])
  })

  it('refuses a variant that belongs to another product or is switched off', () => {
    const products = new Map([['a', product({ id: 'a' })]])
    const v = buildCartView(
      [
        { productId: 'a', variantId: 'other', qty: 1 },
        { productId: 'a', variantId: 'off', qty: 1 },
      ],
      products,
      new Map([
        ['other', variant({ id: 'other', productId: 'b' })],
        ['off', variant({ id: 'off', productId: 'a', active: false })],
      ]),
    )
    expect(v.lines).toEqual([])
    expect(v.removed).toHaveLength(2)
  })

  it('keeps currencies apart instead of adding them', () => {
    const v = buildCartView(
      [
        { productId: 'a', variantId: null, qty: 1 },
        { productId: 'b', variantId: null, qty: 2 },
      ],
      new Map([
        ['a', product({ id: 'a', priceCents: 500, currency: 'usd' })],
        ['b', product({ id: 'b', priceCents: 700, currency: 'eur' })],
      ]),
      new Map(),
    )
    expect(v.totals).toEqual([
      { currency: 'usd', cents: 500 },
      { currency: 'eur', cents: 1400 },
    ])
  })
})
