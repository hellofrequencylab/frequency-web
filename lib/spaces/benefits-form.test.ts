import { describe, it, expect } from 'vitest'

// MEMBER BENEFITS — THE EDITOR'S DRAFT LAYER (ADR-1372, backlog LIVE-093). Network-free: every
// function under test is pure, so nothing is mocked. What is locked here:
//   1. NUMBERS SURVIVE THE ROUND TRIP. Percent goes to basis points and back; dollars go to cents
//      and back. A half-typed or hostile value is rejected rather than rounded into something.
//   2. THE PREVIEW SENTENCE IS THE REAL ARITHMETIC. It is computed through benefitDiscountCents, so
//      a preview can never name a price the checkout would not charge.
//   3. CONVERSION FAILS LOUD, WHERE THE SERVER FAILS CLOSED. normalizeBenefit drops an unassigned
//      or nameless row; the editor has to say why first, or the operator watches work vanish.
//   4. IDS SURVIVE AN EDIT, because space_tier_benefits and the redemption ledger point at them.

import {
  BENEFIT_KIND_OPTIONS,
  BENEFIT_SCOPE_OPTIONS,
  SAMPLE_PRICE_CENTS,
  bpsToPercent,
  centsToDollars,
  dateToIso,
  dollarsToCents,
  draftEffectLine,
  draftsToBenefits,
  emptyDraft,
  formatBenefitValue,
  formatPrice,
  isoToDate,
  joinNames,
  parseBenefitValue,
  percentToBps,
  toDrafts,
  type BenefitDraft,
} from './benefits-form'
import { benefitDiscountCents, type MemberBenefit } from './benefits'

const SPACE = 'space-0000-4000-a000-00000000temp'
const TIER_A = 'tier-0000-4000-a000-000000000001'
const TIER_B = 'tier-0000-4000-a000-000000000002'

function draft(patch: Partial<BenefitDraft> = {}): BenefitDraft {
  return { ...emptyDraft(), label: 'Temple Member', value: '15', tierIds: [TIER_A], ...patch }
}

describe('number conversion', () => {
  it('round-trips a percent through basis points', () => {
    expect(percentToBps('15')).toBe(1500)
    expect(percentToBps('12.5')).toBe(1250)
    expect(bpsToPercent(1500)).toBe('15')
    expect(bpsToPercent(1250)).toBe('12.50')
  })

  it('rejects a percent above 100 and a malformed one', () => {
    expect(percentToBps('101')).toBeNull()
    expect(percentToBps('12.')).toBeNull()
    expect(percentToBps('-5')).toBeNull()
    expect(percentToBps('fifteen')).toBeNull()
  })

  it('round-trips dollars through cents, dropping whole-dollar cents', () => {
    expect(dollarsToCents('18.70')).toBe(1870)
    expect(dollarsToCents('22')).toBe(2200)
    expect(centsToDollars(1870)).toBe('18.70')
    expect(centsToDollars(2200)).toBe('22')
    expect(centsToDollars(0)).toBe('')
  })

  it('rejects malformed dollars and reads blank as zero', () => {
    expect(dollarsToCents('')).toBe(0)
    expect(dollarsToCents('5.')).toBeNull()
    expect(dollarsToCents('5.005')).toBeNull()
    expect(dollarsToCents('$5')).toBeNull()
  })

  it('reads a value in the units its kind uses, and gives included no value', () => {
    expect(parseBenefitValue('percent', '15')).toBe(1500)
    expect(parseBenefitValue('amount_off', '5')).toBe(500)
    expect(parseBenefitValue('fixed_price', '18.70')).toBe(1870)
    expect(parseBenefitValue('included', 'anything at all')).toBe(0)
    expect(formatBenefitValue('included', 999)).toBe('')
  })

  it('round-trips a date through UTC midnight', () => {
    expect(dateToIso('2026-03-21')).toBe('2026-03-21T00:00:00.000Z')
    expect(isoToDate('2026-03-21T00:00:00.000Z')).toBe('2026-03-21')
    expect(dateToIso('21/03/2026')).toBeNull()
    expect(isoToDate(null)).toBe('')
    expect(isoToDate('not a date')).toBe('')
  })
})

describe('the preview sentence', () => {
  it('names the price benefitDiscountCents actually produces', () => {
    const line = draftEffectLine({ kind: 'percent', value: '15', scope: 'space_events' }, ['Members'])
    const discount = benefitDiscountCents({ kind: 'percent', value: 1500 }, SAMPLE_PRICE_CENTS)
    expect(discount).toBe(330)
    expect(line).toContain(formatPrice(SAMPLE_PRICE_CENTS - discount))
    expect(line).toBe('Example: on a $22 ticket, Members pay $18.70.')
  })

  it('lists several tiers in plain language', () => {
    expect(joinNames(['Members'])).toBe('Members')
    expect(joinNames(['Members', 'Guardians'])).toBe('Members and Guardians')
    expect(joinNames(['Members', 'Guardians', 'Founders'])).toBe('Members, Guardians and Founders')
  })

  it('asks for a tier before it prices anything', () => {
    expect(draftEffectLine({ kind: 'percent', value: '15', scope: 'all' }, [])).toBe(
      'Pick a tier. A benefit with no tier applies to nobody.',
    )
  })

  it('never invents a number for a half-typed or inert row', () => {
    expect(draftEffectLine({ kind: 'percent', value: '12.', scope: 'stays' }, ['Members'])).not.toMatch(
      /pay \$/,
    )
    // A fixed price at or above list is not a discount, and the sentence says so rather than
    // claiming a saving of zero.
    expect(draftEffectLine({ kind: 'fixed_price', value: '30', scope: 'products' }, ['Members'])).toBe(
      'Nothing comes off a $22 product yet.',
    )
  })

  it('takes the whole price for an included benefit', () => {
    expect(draftEffectLine({ kind: 'included', value: '', scope: 'space_events' }, ['Members'])).toBe(
      'Example: on a $22 ticket, Members pay $0.',
    )
  })

  it('covers every kind and scope the contract defines', () => {
    for (const kind of BENEFIT_KIND_OPTIONS) {
      for (const scope of BENEFIT_SCOPE_OPTIONS) {
        const line = draftEffectLine({ kind: kind.value, value: '10', scope: scope.value }, ['Members'])
        expect(line.length).toBeGreaterThan(0)
        expect(line).not.toContain('undefined')
      }
    }
  })
})

describe('draft to wire', () => {
  it('converts a complete row', () => {
    const result = draftsToBenefits(
      [draft({ maxUses: '2', period: 'month', startsAt: '2026-03-21', endsAt: '2026-06-21' })],
      SPACE,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.benefits[0]).toMatchObject({
      spaceId: SPACE,
      kind: 'percent',
      value: 1500,
      scope: 'space_events',
      label: 'Temple Member',
      maxUses: 2,
      period: 'month',
      startsAt: '2026-03-21T00:00:00.000Z',
      endsAt: '2026-06-21T00:00:00.000Z',
      isActive: true,
      tierIds: [TIER_A],
    })
  })

  it('keeps an existing id so assignments and the redemption ledger survive the edit', () => {
    const result = draftsToBenefits([draft({ id: 'benefit-1' })], SPACE)
    expect(result.ok && result.benefits[0]!.id).toBe('benefit-1')
  })

  it('says what to fix instead of dropping the row', () => {
    expect(draftsToBenefits([draft({ label: '   ' })], SPACE)).toEqual({
      ok: false,
      error: 'Give every benefit a name members will see.',
    })
    expect(draftsToBenefits([draft({ tierIds: [] })], SPACE)).toEqual({
      ok: false,
      error: 'Pick at least one tier for every benefit.',
    })
    expect(draftsToBenefits([draft({ value: '150' })], SPACE)).toEqual({
      ok: false,
      error: 'Use a percent like 15 or 12.5, up to 100.',
    })
    expect(draftsToBenefits([draft({ kind: 'amount_off', value: '0' })], SPACE)).toEqual({
      ok: false,
      error: 'An amount off needs a dollar amount above zero.',
    })
    expect(draftsToBenefits([draft({ maxUses: 'two' })], SPACE)).toEqual({
      ok: false,
      error: 'Uses is a whole number, or blank for no limit.',
    })
    expect(
      draftsToBenefits([draft({ startsAt: '2026-06-21', endsAt: '2026-03-21' })], SPACE),
    ).toEqual({ ok: false, error: 'The end date has to come after the start date.' })
  })

  it('drops a period when nothing caps the uses, so a stale window cannot outlive its cap', () => {
    const result = draftsToBenefits([draft({ maxUses: '', period: 'month' })], SPACE)
    expect(result.ok && result.benefits[0]!.period).toBeNull()
    expect(result.ok && result.benefits[0]!.maxUses).toBeNull()
  })

  it('de-duplicates a tier assignment', () => {
    const result = draftsToBenefits([draft({ tierIds: [TIER_A, TIER_A, TIER_B] })], SPACE)
    expect(result.ok && result.benefits[0]!.tierIds).toEqual([TIER_A, TIER_B])
  })
})

describe('wire to draft', () => {
  const saved: MemberBenefit = {
    id: 'benefit-1',
    spaceId: SPACE,
    kind: 'percent',
    value: 1500,
    scope: 'stays',
    label: 'Temple Member',
    maxUses: 3,
    period: 'year',
    startsAt: '2026-03-21T00:00:00.000Z',
    endsAt: null,
    isActive: false,
    tierIds: [TIER_A, TIER_B],
  }

  it('survives a full round trip', () => {
    const [back] = toDrafts([saved])
    expect(back).toMatchObject({
      id: 'benefit-1',
      label: 'Temple Member',
      kind: 'percent',
      value: '15',
      scope: 'stays',
      maxUses: '3',
      period: 'year',
      startsAt: '2026-03-21',
      endsAt: '',
      isActive: false,
      tierIds: [TIER_A, TIER_B],
    })
    const result = draftsToBenefits([back!], SPACE)
    expect(result.ok && result.benefits[0]).toEqual(saved)
  })

  it('drops a tier the Space no longer has, so the editor shows what the server would keep', () => {
    const [back] = toDrafts([saved], [TIER_A])
    expect(back!.tierIds).toEqual([TIER_A])
  })

  it('starts a new row assigned to nobody', () => {
    expect(emptyDraft().tierIds).toEqual([])
    expect(draftsToBenefits([emptyDraft()], SPACE).ok).toBe(false)
  })
})
