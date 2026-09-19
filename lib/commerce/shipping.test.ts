import { describe, it, expect } from 'vitest'
import { SHIP_TO_COUNTRIES, cartNeedsShipping, shippingDetailsFromSession } from './shipping'

describe('cartNeedsShipping', () => {
  it('asks for an address on a physical line, and on a legacy row with no kind', () => {
    expect(cartNeedsShipping(['physical'])).toBe(true)
    expect(cartNeedsShipping([null])).toBe(true)
    expect(cartNeedsShipping([undefined])).toBe(true)
    expect(cartNeedsShipping([''])).toBe(true)
  })

  it('does not ask on a Journey, a download, a booking, a ticket, or a service', () => {
    expect(cartNeedsShipping(['journey'])).toBe(false)
    expect(cartNeedsShipping(['digital', 'service', 'booking', 'ticket', 'journey'])).toBe(false)
  })

  it('asks when any line in a mixed cart ships', () => {
    expect(cartNeedsShipping(['journey', 'physical'])).toBe(true)
  })
})

describe('shippingDetailsFromSession', () => {
  const address = {
    name: 'Ada Lovelace',
    address: { line1: '1 Market St', city: 'Austin', state: 'TX', postal_code: '78701', country: 'US' },
  }

  it('reads shipping_details, then collected_information, then shipping', () => {
    expect(shippingDetailsFromSession({ shipping_details: address })).toEqual(address)
    expect(shippingDetailsFromSession({ collected_information: { shipping_details: address } })).toEqual(address)
    expect(shippingDetailsFromSession({ shipping: address })).toEqual(address)
  })

  it('prefers shipping_details when more than one slot is filled', () => {
    expect(
      shippingDetailsFromSession({
        shipping_details: { name: 'first' },
        collected_information: { shipping_details: { name: 'second' } },
        shipping: { name: 'third' },
      }),
    ).toEqual({ name: 'first' })
  })

  it('returns null when Stripe collected nothing', () => {
    expect(shippingDetailsFromSession({})).toBeNull()
    expect(shippingDetailsFromSession({ shipping_details: null })).toBeNull()
    expect(shippingDetailsFromSession({ shipping_details: 'Ada' })).toBeNull()
    expect(shippingDetailsFromSession({ shipping_details: [] })).toBeNull()
  })
})

describe('SHIP_TO_COUNTRIES', () => {
  it('is a non-empty list of unique ISO-3166 alpha-2 codes, and includes the US', () => {
    expect(SHIP_TO_COUNTRIES.length).toBeGreaterThan(10)
    expect(new Set(SHIP_TO_COUNTRIES).size).toBe(SHIP_TO_COUNTRIES.length)
    expect(SHIP_TO_COUNTRIES.every((c) => /^[A-Z]{2}$/.test(c))).toBe(true)
    expect(SHIP_TO_COUNTRIES).toContain('US')
  })
})
