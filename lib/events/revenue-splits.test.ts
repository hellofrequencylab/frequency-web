import { describe, expect, it } from 'vitest'
import { COLLABORATOR_SPLIT_MAX_BPS, planTicketSplit, splitMetadata, validateRevenueSplits } from './revenue-splits'
import { planTransferShares } from '@/lib/commerce/transfers'
import { splitTotals } from '@/lib/commerce/funds-flow'

const ctx = { collaboratorSpaceIds: ['a', 'b'], readySpaceIds: ['a', 'b'] }
const home = { spaceId: 'home', ownerProfileId: 'host', stripeAccountId: 'acct_home' }
const payee = (spaceId: string, bps: number) => ({ spaceId, ownerProfileId: `owner-${spaceId}`, stripeAccountId: `acct_${spaceId}`, bps })

describe('validateRevenueSplits', () => {
  it('keeps shares for accepted, payable Collaborators and drops zero shares', () => {
    expect(validateRevenueSplits([{ spaceId: 'a', bps: 2500 }, { spaceId: 'b', bps: 0 }], ctx))
      .toEqual({ ok: true, shares: [{ spaceId: 'a', bps: 2500 }] })
  })
  it('refuses a Space that is not an accepted Collaborator', () => {
    expect(validateRevenueSplits([{ spaceId: 'z', bps: 100 }], ctx)).toEqual({ refused: 'not_collaborator', spaceId: 'z' })
  })
  it('refuses a payee whose payouts are not live', () => {
    expect(validateRevenueSplits([{ spaceId: 'b', bps: 100 }], { ...ctx, readySpaceIds: ['a'] }))
      .toEqual({ refused: 'payouts_not_ready', spaceId: 'b' })
  })
  it('refuses more than the cap together, and keeps the home Space its minimum', () => {
    expect(COLLABORATOR_SPLIT_MAX_BPS).toBe(9500)
    expect(validateRevenueSplits([{ spaceId: 'a', bps: 5000 }, { spaceId: 'b', bps: 4500 }], ctx)).toMatchObject({ ok: true })
    expect(validateRevenueSplits([{ spaceId: 'a', bps: 5000 }, { spaceId: 'b', bps: 4501 }], ctx)).toEqual({ refused: 'over_cap' })
    expect(validateRevenueSplits([{ spaceId: 'a', bps: 10000 }], ctx)).toEqual({ refused: 'over_cap' })
  })
  it('refuses a malformed or duplicate share', () => {
    expect(validateRevenueSplits([{ spaceId: 'a', bps: 10001 }], ctx)).toEqual({ refused: 'bad_bps', spaceId: 'a' })
    expect(validateRevenueSplits([{ spaceId: 'a', bps: 12.5 }], ctx)).toEqual({ refused: 'bad_bps', spaceId: 'a' })
    expect(validateRevenueSplits([{ spaceId: 'a', bps: -1 }], ctx)).toEqual({ refused: 'bad_bps', spaceId: 'a' })
    expect(validateRevenueSplits([{ spaceId: 'a', bps: 100 }, { spaceId: 'a', bps: 200 }], ctx)).toEqual({ refused: 'duplicate', spaceId: 'a' })
  })
})

describe('planTicketSplit', () => {
  it('sums to the gross and to the fee, with the home Space first and holding both remainders', () => {
    const splits = planTicketSplit({ grossCents: 3333, platformFeeCents: 166, home, payees: [payee('a', 2500), payee('b', 1000)] })
    expect(splits.map((s) => s.seller.owner_space_id)).toEqual(['home', 'a', 'b'])
    expect(splits[1]).toMatchObject({ grossCents: 833, platformFeeCents: 41, stripeAccountId: 'acct_a' })
    expect(splits[2]).toMatchObject({ grossCents: 333, platformFeeCents: 16, stripeAccountId: 'acct_b' })
    expect(splits[0]).toMatchObject({ grossCents: 3333 - 833 - 333, platformFeeCents: 166 - 41 - 16 })
    expect(splitTotals(splits)).toEqual({ grossCents: 3333, platformFeeCents: 166 })
    expect(splits.every((s) => s.seller.owner_kind === 'space')).toBe(true)
  })
  it('folds a share that floors to nothing back into the home Space', () => {
    const splits = planTicketSplit({ grossCents: 3, platformFeeCents: 0, home, payees: [payee('a', 2500)] })
    expect(splits).toHaveLength(1)
    expect(splits[0].grossCents).toBe(3)
  })
  it('never pays the home Space twice when it is listed as a payee', () => {
    const splits = planTicketSplit({ grossCents: 1000, platformFeeCents: 50, home, payees: [payee('home', 5000), payee('a', 1000)] })
    expect(splits.map((s) => s.seller.owner_space_id)).toEqual(['home', 'a'])
    expect(splitTotals(splits)).toEqual({ grossCents: 1000, platformFeeCents: 50 })
  })
  it('writes a metadata.split the LIVE-622 ledger plans transfers from', () => {
    const splits = planTicketSplit({ grossCents: 2000, platformFeeCents: 100, home, payees: [payee('a', 3000)] })
    const plan = planTransferShares({
      id: 'order', funds_flow: 'separate', amount_cents: 2000, platform_fee_cents: 100, currency: 'usd',
      metadata: { split: splitMetadata(splits) },
    })
    expect('shares' in plan && plan.shares.map((s) => [s.ownerSpaceId, s.amountCents, s.platformFeeCents]))
      .toEqual([['home', 1400 - 70, 70], ['a', 600 - 30, 30]])
  })
})
