import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cardFeeCentsAt, cardFeePassThroughFrom, cardFeePassesThrough, sellerFeesAt, sellerFeesNow } from './card-fee'

const KEY = 'CARD_FEE_PASS_THROUGH_FROM'
const ORIG = process.env[KEY]

afterEach(() => {
  if (ORIG === undefined) delete process.env[KEY]
  else process.env[KEY] = ORIG
})

// The effective date (owner ruling 2026-11-18). Off, every checkout prices exactly as it did before;
// on, a sale made on or after the instant carries the card fee and one made before it does not.
describe('CARD_FEE_PASS_THROUGH_FROM', () => {
  it('is off when unset, blank, typed like a flag, or not a full timestamp with a zone', () => {
    for (const v of [undefined, '', '   ', 'soon', 'true', 'on', '1', '2027-02-01', '2027-02-01T08:00:00']) {
      if (v === undefined) delete process.env[KEY]
      else process.env[KEY] = v
      expect(cardFeePassThroughFrom()).toBeNull()
      expect(cardFeePassesThrough()).toBe(false)
      expect(cardFeeCentsAt(2500)).toBe(0)
      expect(sellerFeesNow(2500, 125)).toEqual({ platformFeeCents: 125, processingFeeCents: 0, applicationFeeCents: 125 })
    }
  })

  it('is on from the instant it names, and not a moment before', () => {
    process.env[KEY] = '2027-02-01T08:00:00Z'
    expect(cardFeePassThroughFrom()?.toISOString()).toBe('2027-02-01T08:00:00.000Z')
    expect(cardFeePassesThrough('2027-02-01T07:59:59Z')).toBe(false)
    expect(cardFeePassesThrough('2027-02-01T08:00:00Z')).toBe(true)
    expect(cardFeePassesThrough(new Date('2027-03-01T00:00:00Z'))).toBe(true)
  })

  it('prices a past sale by when it was made, so history never changes when the date arrives', () => {
    process.env[KEY] = '2027-02-01T08:00:00Z'
    expect(cardFeeCentsAt(2500, '2027-01-15T00:00:00Z')).toBe(0)
    expect(cardFeeCentsAt(2500, '2027-02-15T00:00:00Z')).toBe(103)
    expect(sellerFeesAt(2500, 0, '2027-01-15T00:00:00Z').applicationFeeCents).toBe(0)
    expect(sellerFeesAt(2500, 0, '2027-02-15T00:00:00Z')).toEqual({
      platformFeeCents: 0,
      processingFeeCents: 103,
      applicationFeeCents: 103,
    })
  })

  it('never invents a fee for a sale whose time is unknown', () => {
    process.env[KEY] = '2020-01-01T00:00:00Z'
    expect(cardFeePassesThrough(null)).toBe(false)
    expect(cardFeePassesThrough('not a date')).toBe(false)
    expect(cardFeeCentsAt(2500, null)).toBe(0)
  })

  it('once on, a checkout sends Stripe both fees and keeps them apart', () => {
    process.env[KEY] = '2020-01-01T00:00:00Z'
    expect(sellerFeesNow(2500, 0)).toEqual({ platformFeeCents: 0, processingFeeCents: 103, applicationFeeCents: 103 })
    expect(sellerFeesNow(2500, 125)).toEqual({ platformFeeCents: 125, processingFeeCents: 103, applicationFeeCents: 228 })
  })
})

// Every seller checkout must price its application fee through this module. A creator that sends
// the bare platform fee leaves Frequency paying the card fee on that channel, silently, and no
// behavior test notices because the money still moves. So the wiring itself is pinned.
describe('every seller checkout sends the card fee through sellerFeesNow', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

  it('tips, donations, tickets and shop orders set application_fee_amount from it', () => {
    expect(read('lib/billing/tips.ts')).toMatch(/application_fee_amount: sellerFeesNow\(amount, fee\)\.applicationFeeCents/)
    expect(read('lib/billing/space-donation-checkout.ts')).toMatch(
      /application_fee_amount: sellerFeesNow\(amount, fee\)\.applicationFeeCents/,
    )
    const tickets = read('lib/billing/tickets.ts')
    expect(tickets).toMatch(/const sellerFees = sellerFeesNow\(gross, fee\)/)
    expect(tickets).toMatch(/application_fee_amount: sellerFees\.applicationFeeCents/)
    expect(read('lib/commerce/checkout.ts')).toMatch(
      /application_fee_amount: sellerFeesNow\(gross, head\.charge\.platformFeeCents\)\.applicationFeeCents/,
    )
  })

  it('a membership folds it into the subscription percent, and is unchanged while off', () => {
    const src = read('lib/billing/space-membership-checkout.ts')
    expect(src).toMatch(/application_fee_percent: cardFeePassesThrough\(\)/)
    expect(src).toMatch(/applicationFeePercent\(amount, sellerFeesNow\(amount, fee\)\)/)
    expect(src).toMatch(/: round2\(\(fee \/ amount\) \* 100\)/)
  })

  it('no seller checkout still sends a bare platform fee to Stripe', () => {
    for (const rel of [
      'lib/billing/tips.ts',
      'lib/billing/space-donation-checkout.ts',
      'lib/billing/tickets.ts',
      'lib/commerce/checkout.ts',
    ]) {
      expect(read(rel), rel).not.toMatch(/application_fee_amount: (fee|head\.charge\.platformFeeCents),/)
    }
  })
})
