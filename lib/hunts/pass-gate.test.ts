import { describe, expect, it } from 'vitest'
import { decidePassCheckout } from './pass-gate'
import type { CanonicalTier, PassBinding } from './pass-binding'

const binding: PassBinding = { id: 'b1', huntId: 'h1', versionId: 'v1', eventId: 'e1', ticketTypeId: 't1', sellerSpaceId: 's1', benefitCodes: ['entry'], revision: 1, status: 'active' }
const tier: CanonicalTier = { id: 't1', eventId: 'e1', sellerSpaceId: 's1', pricingMode: 'fixed', priceCents: 2500, currency: 'usd', quantity: 10, sold: 2, salesOpen: true }
const req = { eventId: 'e1', ticketTypeId: 't1', qty: 2 }

describe('decidePassCheckout', () => {
  it('leaves an unbound tier alone', () => {
    expect(decidePassCheckout(null, tier, req, false)).toEqual({ ok: true })
  })
  it('sells a good bound request', () => {
    expect(decidePassCheckout(binding, tier, req, true)).toEqual({ ok: true })
  })
  it('refuses a wrong tier', () => {
    const out = decidePassCheckout(binding, tier, { ...req, ticketTypeId: 't2' }, true)
    expect(out.ok).toBe(false)
  })
  it('refuses a wrong event', () => {
    expect(decidePassCheckout(binding, tier, { ...req, eventId: 'e2' }, true).ok).toBe(false)
  })
  it('refuses when the kill switch is closed, with a line that names no rule', () => {
    const out = decidePassCheckout(binding, tier, req, false)
    expect(out).toEqual({ ok: false, error: 'This pass is not on sale right now.' })
    expect(JSON.stringify(out)).not.toMatch(/hunt|binding|price/i)
  })
  it('a tier that is not fixed-price paid cannot carry a pass, whatever the browser says', () => {
    expect(decidePassCheckout(binding, { ...tier, pricingMode: 'pwyc', priceCents: null }, req, true).ok).toBe(false)
  })
  it('refuses a retired binding and a sold-out tier', () => {
    expect(decidePassCheckout({ ...binding, status: 'retired' }, tier, req, true).ok).toBe(false)
    expect(decidePassCheckout(binding, { ...tier, sold: 10 }, req, true).ok).toBe(false)
  })
})
