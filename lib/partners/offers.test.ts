import { describe, it, expect } from 'vitest'
import { buildOfferRow, isOfferLive, loyaltyProgress, OFFER_TITLE_MAX, pickPlaqueOffer } from './offers'

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

describe('pickPlaqueOffer (LIVE-673)', () => {
  const plain = { id: 'plain', quest_id: null }
  const other = { id: 'other', quest_id: null }
  const quest = { id: 'quest', quest_id: 'q1' }
  it('credits the one ordinary offer', () => {
    expect(pickPlaqueOffer([plain], new Set())).toBe(plain)
  })
  it('keeps a Quest sponsor reward from a member who has not finished the Quest', () => {
    expect(pickPlaqueOffer([quest], new Set())).toBeNull()
    expect(pickPlaqueOffer([plain, quest], new Set())).toBe(plain)
  })
  it('claims the earned Quest reward first, even beside an ordinary offer', () => {
    expect(pickPlaqueOffer([quest], new Set(['q1']))).toBe(quest)
    expect(pickPlaqueOffer([plain, quest], new Set(['q1']))).toBe(quest)
  })
  it('never claims a Quest reward twice', () => {
    expect(pickPlaqueOffer([plain, quest], new Set(['q1']), new Set(['quest']))).toBe(plain)
  })
  it('does not guess between two ordinary offers', () => {
    expect(pickPlaqueOffer([plain, other], new Set())).toBeNull()
  })
})

describe('buildOfferRow quest link (LIVE-673)', () => {
  it('stores a sponsored Quest and clears an empty one', () => {
    const base = { title: 'Free tea', description: '', terms: '', validUntil: '', active: true }
    const a = buildOfferRow({ ...base, questId: ' q1 ' })
    const b = buildOfferRow({ ...base, questId: '' })
    expect(a.ok && a.row.quest_id).toBe('q1')
    expect(b.ok && b.row.quest_id).toBeNull()
  })
})

describe('loyalty cards (LIVE-710)', () => {
  const base = { title: 'Fifth coffee free', description: '', terms: '', validUntil: '', active: true }
  it('stores a visit count in range and refuses one outside it', () => {
    const a = buildOfferRow({ ...base, visitsRequired: '5' })
    expect(a.ok && a.row.visits_required).toBe(5)
    expect(buildOfferRow({ ...base, visitsRequired: '1' }).ok).toBe(false)
    expect(buildOfferRow({ ...base, visitsRequired: '2.5' }).ok).toBe(false)
    const b = buildOfferRow({ ...base, visitsRequired: '' })
    expect(b.ok && b.row.visits_required).toBeNull()
  })
  it('is never a Quest reward at the same time', () => {
    expect(buildOfferRow({ ...base, visitsRequired: 5, questId: 'q1' }).ok).toBe(false)
  })
  it('is never credited by a plaque tap', () => {
    const card = { id: 'card', quest_id: null, visits_required: 5 }
    const plain = { id: 'plain', quest_id: null, visits_required: null }
    expect(pickPlaqueOffer([card], new Set())).toBeNull()
    expect(pickPlaqueOffer([card, plain], new Set())).toBe(plain)
  })
  it('counts visits since the last claim of this card', () => {
    const rows = [
      { offer_id: null, source: 'nfc', redeemed_at: '2026-10-01T10:00:00Z' },
      { offer_id: null, source: 'qr', redeemed_at: '2026-10-02T10:00:00Z' },
      { offer_id: 'card', source: 'loyalty', redeemed_at: '2026-10-02T11:00:00Z' },
      { offer_id: null, source: 'nfc', redeemed_at: '2026-10-03T10:00:00Z' },
    ]
    expect(loyaltyProgress(rows, 'card', 3)).toEqual({ visits: 1, required: 3, earned: false })
    expect(loyaltyProgress(rows, 'other', 3)).toEqual({ visits: 3, required: 3, earned: true })
  })
})
