import { describe, it, expect } from 'vitest'
import { buildOfferRow, isOfferLive, OFFER_TITLE_MAX } from './offers'

describe('buildOfferRow', () => {
  it('normalises a full offer into partner_offers columns', () => {
    const r = buildOfferRow({
      title: '  Two for one flat whites  ',
      description: ' Show your code at the till. ',
      terms: 'Weekdays before 11.',
      validUntil: '2026-12-31',
      active: true,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.row).toEqual({
      title: 'Two for one flat whites',
      description: 'Show your code at the till.',
      member_terms: 'Weekdays before 11.',
      valid_until: '2026-12-31T23:59:59.999Z',
      active: true,
    })
  })

  it('requires a title and caps its length', () => {
    expect(buildOfferRow({ title: '   ', description: '', terms: '', validUntil: '', active: true })).toMatchObject({ ok: false })
    expect(
      buildOfferRow({ title: 'x'.repeat(OFFER_TITLE_MAX + 1), description: '', terms: '', validUntil: '', active: true }),
    ).toMatchObject({ ok: false })
  })

  it('takes an empty date as no expiry and rejects a fake one', () => {
    const open = buildOfferRow({ title: 'Free refill', description: '', terms: '', validUntil: '', active: false })
    expect(open).toMatchObject({ ok: true, row: { valid_until: null, active: false, description: null, member_terms: null } })
    expect(buildOfferRow({ title: 'x', description: '', terms: '', validUntil: 'soon', active: true })).toMatchObject({ ok: false })
    expect(buildOfferRow({ title: 'x', description: '', terms: '', validUntil: '2026-02-31', active: true })).toMatchObject({ ok: false })
  })
})

describe('isOfferLive', () => {
  const now = '2026-09-05T12:00:00.000Z'
  it('is live only when active and not expired', () => {
    expect(isOfferLive({ active: true, valid_until: null }, now)).toBe(true)
    expect(isOfferLive({ active: true, valid_until: '2026-09-06T00:00:00.000Z' }, now)).toBe(true)
    expect(isOfferLive({ active: true, valid_until: '2026-09-01T00:00:00.000Z' }, now)).toBe(false)
    expect(isOfferLive({ active: false, valid_until: null }, now)).toBe(false)
  })
})
