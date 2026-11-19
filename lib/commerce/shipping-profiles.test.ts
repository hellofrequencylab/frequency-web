import { describe, expect, it } from 'vitest'
import { EVERYWHERE, parseShippingRates, quoteCartShipping, type ShippingProfile } from './shipping-profiles'
import { buildCartView } from './cart-view'
import type { CommerceProduct } from './types'

const profile = (o: Partial<ShippingProfile> & { id: string }): ShippingProfile => ({
  name: o.id,
  currency: 'usd',
  processingDaysMin: 1,
  processingDaysMax: 3,
  rates: [],
  ...o,
})

describe('parseShippingRates', () => {
  it('keeps well-formed rates, upper-cases regions, and drops junk, repeats and bad prices', () => {
    expect(
      parseShippingRates([
        { region: 'us', firstCents: 500, additionalCents: 200 },
        { region: 'US', firstCents: 900, additionalCents: 0 },
        { region: '*', firstCents: '1500' },
        { region: 'USA', firstCents: 100 },
        { region: 'CA', firstCents: -1 },
        { region: 'GB' },
        null,
        'x',
      ]),
    ).toEqual([
      { region: 'US', firstCents: 500, additionalCents: 200 },
      { region: EVERYWHERE, firstCents: 1500, additionalCents: 0 },
    ])
    expect(parseShippingRates({ region: 'US' })).toEqual([])
    expect(parseShippingRates(Array.from({ length: 80 }, () => ({ region: '*', firstCents: 1 })))).toHaveLength(1)
  })
})

describe('quoteCartShipping', () => {
  const standard = profile({
    id: 'std',
    rates: [
      { region: 'US', firstCents: 500, additionalCents: 100 },
      { region: EVERYWHERE, firstCents: 1500, additionalCents: 500 },
    ],
  })
  const usOnly = profile({
    id: 'us',
    rates: [
      { region: 'US', firstCents: 300, additionalCents: 300 },
      { region: 'CA', firstCents: 800, additionalCents: 0 },
    ],
  })

  it('charges the first unit once per profile and every other unit the extra rate, across lines', () => {
    const q = quoteCartShipping(
      [
        { productId: 'a', qty: 2 },
        { productId: 'b', qty: 1 },
        { productId: 'free', qty: 4 },
      ],
      new Map([
        ['a', standard],
        ['b', standard],
      ]),
      'us',
    )
    expect(q).toEqual({ totals: [{ currency: 'usd', cents: 700 }], estimate: false, unshippable: [] })
  })

  it('adds two profiles, falls back to everywhere else, and names what does not ship to the country', () => {
    const q = quoteCartShipping(
      [
        { productId: 'a', qty: 1 },
        { productId: 'b', qty: 1 },
      ],
      new Map([
        ['a', standard],
        ['b', usOnly],
      ]),
      'FR',
    )
    expect(q.totals).toEqual([{ currency: 'usd', cents: 1500 }])
    expect(q.unshippable).toEqual(['b'])
  })

  it('with no country, quotes the everywhere-else rate or the lowest rate, as an estimate', () => {
    const q = quoteCartShipping(
      [
        { productId: 'a', qty: 1 },
        { productId: 'b', qty: 1 },
      ],
      new Map([
        ['a', standard],
        ['b', usOnly],
      ]),
    )
    expect(q).toEqual({ totals: [{ currency: 'usd', cents: 1800 }], estimate: true, unshippable: [] })
  })
})

describe('buildCartView with shipping profiles', () => {
  const product = (id: string): CommerceProduct =>
    ({
      id,
      title: id,
      images: [],
      priceCents: 1000,
      currency: 'usd',
      stock: null,
      status: 'active',
      productKind: 'physical',
      ownerKind: 'space',
      ownerProfileId: null,
      ownerSpaceId: 's1',
    }) as unknown as CommerceProduct

  it('adds the estimate to the view and holds checkout until the door can charge shipping', () => {
    const v = buildCartView(
      [{ productId: 'a', variantId: null, qty: 2 }],
      new Map([['a', product('a')]]),
      new Map(),
      new Map([['a', profile({ id: 'p', rates: [{ region: EVERYWHERE, firstCents: 400, additionalCents: 100 }] })]]),
    )
    expect(v.totals).toEqual([{ currency: 'usd', cents: 2000 }])
    expect(v.shipping.totals).toEqual([{ currency: 'usd', cents: 500 }])
    expect(v.checkout.blocked).toBe('shipping_not_charged')
  })

  it('leaves a cart with no profile exactly as it was', () => {
    const v = buildCartView([{ productId: 'a', variantId: null, qty: 1 }], new Map([['a', product('a')]]), new Map())
    expect(v.shipping.totals).toEqual([])
    expect(v.checkout.blocked).toBeNull()
  })
})
