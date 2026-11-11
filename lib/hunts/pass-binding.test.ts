// FH-036: the Experience Pass binding. A forged price, a wrong tier, a retired pass and a closed switch are
// all refused before any money path; the purchase snapshot stays frozen.
import { describe, expect, it } from 'vitest'
import { passReturnPath, purchaseSnapshot, resolvePurchase, snapshotMatches, validateBinding, type CanonicalTier, type PassBinding } from './pass-binding'

const tier: CanonicalTier = { id: 't1', eventId: 'e1', sellerSpaceId: 's1', pricingMode: 'fixed', priceCents: 4500, currency: 'usd', quantity: 10, sold: 2, salesOpen: true }
const binding: PassBinding = { id: 'b1', huntId: 'h1', versionId: 'v1', eventId: 'e1', ticketTypeId: 't1', sellerSpaceId: 's1', benefitCodes: ['stamp-card', 'dinner'], revision: 1, status: 'active' }
const input = { huntId: 'h1', versionId: 'v1', eventId: 'e1', ticketTypeId: 't1', sellerSpaceId: 's1', benefitCodes: ['dinner', 'stamp-card'] }

describe('validateBinding', () => {
  it('accepts a paid tier of the right Event and seller, sorting the codes', () => {
    expect(validateBinding(input, tier, ['dinner', 'stamp-card', 'x'], null)).toEqual({ ok: true, benefitCodes: ['dinner', 'stamp-card'] })
  })
  it.each([
    ['tier_not_found', { ...input, ticketTypeId: 'other' }, tier],
    ['event_mismatch', { ...input, eventId: 'e2' }, tier],
    ['seller_mismatch', { ...input, sellerSpaceId: 's2' }, tier],
    ['tier_not_paid', input, { ...tier, pricingMode: 'free' as const }],
    ['tier_not_paid', input, { ...tier, pricingMode: 'pwyc' as const }],
    ['no_benefits', { ...input, benefitCodes: [] }, tier],
    ['bad_benefit_code', { ...input, benefitCodes: ['Bad Code'] }, tier],
    ['duplicate_benefit_code', { ...input, benefitCodes: ['dinner', 'dinner'] }, tier],
    ['benefit_not_in_version', { ...input, benefitCodes: ['vip'] }, tier],
  ])('refuses %s', (reason, inp, t) => {
    expect(validateBinding(inp, t, ['dinner', 'stamp-card'], null)).toEqual({ ok: false, reason })
  })
  it('refuses a second active pass on one tier', () => {
    expect(validateBinding(input, tier, ['dinner', 'stamp-card'], binding)).toEqual({ ok: false, reason: 'tier_already_bound' })
  })
})

describe('resolvePurchase', () => {
  const req = { ticketTypeId: 't1', eventId: 'e1', qty: 2 }
  it('prices from the canonical tier and ignores the browser price', () => {
    const out = resolvePurchase(binding, tier, { ...req, clientPriceCents: 1 }, true)
    expect(out).toMatchObject({ ok: true, unitCents: 4500, totalCents: 9000, currency: 'USD' })
  })
  it('refuses a substituted tier, Event or seller', () => {
    expect(resolvePurchase(binding, tier, { ...req, ticketTypeId: 't9' }, true)).toEqual({ ok: false, reason: 'tier_mismatch' })
    expect(resolvePurchase(binding, tier, { ...req, eventId: 'e9' }, true)).toEqual({ ok: false, reason: 'event_mismatch' })
    expect(resolvePurchase(binding, { ...tier, sellerSpaceId: 's9' }, req, true)).toEqual({ ok: false, reason: 'seller_mismatch' })
  })
  it('sells nothing on a free tier, a closed tier, a sold-out tier or a bad quantity', () => {
    expect(resolvePurchase(binding, { ...tier, pricingMode: 'free', priceCents: 0 }, req, true)).toMatchObject({ reason: 'tier_not_paid' })
    expect(resolvePurchase(binding, { ...tier, salesOpen: false }, req, true)).toMatchObject({ reason: 'sales_closed' })
    expect(resolvePurchase(binding, { ...tier, sold: 9 }, req, true)).toMatchObject({ reason: 'sold_out' })
    for (const qty of [0, -1, 1.5, 11]) expect(resolvePurchase(binding, tier, { ...req, qty }, true)).toMatchObject({ reason: 'bad_quantity' })
  })
  it('stops new sales when the kill switch is closed and for a retired pass', () => {
    expect(resolvePurchase(binding, tier, req, false)).toEqual({ ok: false, reason: 'commerce_paused' })
    expect(resolvePurchase({ ...binding, status: 'retired' }, tier, req, true)).toEqual({ ok: false, reason: 'binding_retired' })
  })
})

describe('snapshot and return path', () => {
  it('freezes the binding a purchase was made under', () => {
    const snap = purchaseSnapshot(binding)
    expect(snapshotMatches(snap, binding)).toBe(true)
    expect(snapshotMatches(snap, { ...binding, revision: 2 })).toBe(false)
    expect(snapshotMatches(snap, { ...binding, benefitCodes: ['stamp-card'] })).toBe(false)
  })
  it('only ever returns to an Event slug', () => {
    expect(passReturnPath('river-dinner')).toBe('/events/river-dinner?pass=return')
    for (const bad of ['https://evil.test', '../x', 'a/b', 'A', '']) expect(passReturnPath(bad)).toBeNull()
  })
})
