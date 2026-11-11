// FH-047: the capped sponsor milestone. Frozen once, invoiced once, paid only with a provider reference,
// and an unpaid pledge is never "raised".
import { describe, expect, it } from 'vitest'
import { decideFreeze, freezeSnapshot, nextSettlement, publicMoneyLines, type SponsorAgreement } from './sponsor-milestone'
import type { Rpc } from './entitlements'

const agreement: SponsorAgreement = { id: 'a1', huntId: 'h1', threshold: 3, capCents: 50000, pledgeNumerator: 1000000, pledgeDenominator: 7, status: 'active', approvedAt: '2026-11-10T00:00:00Z', approvedBy: 'p1' }
const now = Date.parse('2026-12-01T00:00:00Z')
const ends = Date.parse('2026-12-31T00:00:00Z')

describe('decideFreeze', () => {
  it('counts distinct confirmed keys and rounds the pledge down to whole cents under the cap', () => {
    const d = decideFreeze({ agreement, confirmedKeys: ['b', 'a', 'a', 'c', ''], nowMs: now, huntEndsAtMs: ends })
    expect(d).toMatchObject({ freeze: true, keys: ['a', 'b', 'c'], owedCents: 50000 })
    const small = decideFreeze({ agreement: { ...agreement, pledgeNumerator: 1000, pledgeDenominator: 3 }, confirmedKeys: ['a', 'b', 'c'], nowMs: now, huntEndsAtMs: ends })
    expect(small).toMatchObject({ freeze: true, owedCents: 333 })
  })
  it('does not freeze duplicates as extra qualifications', () => {
    expect(decideFreeze({ agreement, confirmedKeys: ['a', 'a', 'a'], nowMs: now, huntEndsAtMs: ends })).toEqual({ freeze: false, reason: 'threshold_not_reached' })
  })
  it('stays inert until active and approved, and expires at Hunt end with no rollover', () => {
    expect(decideFreeze({ agreement: { ...agreement, status: 'draft' }, confirmedKeys: ['a', 'b', 'c'], nowMs: now, huntEndsAtMs: ends })).toEqual({ freeze: false, reason: 'not_active' })
    expect(decideFreeze({ agreement: { ...agreement, approvedBy: null }, confirmedKeys: ['a', 'b', 'c'], nowMs: now, huntEndsAtMs: ends })).toEqual({ freeze: false, reason: 'not_approved' })
    expect(decideFreeze({ agreement, confirmedKeys: ['a', 'b', 'c'], nowMs: ends, huntEndsAtMs: ends })).toEqual({ freeze: false, reason: 'after_hunt_end' })
  })
})

describe('freezeSnapshot', () => {
  const decision = { freeze: true as const, keys: ['a', 'b', 'c'], owedCents: 500, huntEndsAt: '2026-12-31T00:00:00.000Z' }
  it('returns the first snapshot on replay without re-pricing', async () => {
    const rpc: Rpc = async () => ({ data: { snapshot_id: 's1', owed_cents: 500, created: false }, error: null })
    expect(await freezeSnapshot(rpc, 'a1', { ...decision, owedCents: 999 })).toEqual({ snapshotId: 's1', owedCents: 500, created: false })
  })
  it('throws on an error or an unknown answer', async () => {
    await expect(freezeSnapshot(async () => ({ data: null, error: { message: 'x' } }), 'a1', decision)).rejects.toThrow('x')
    await expect(freezeSnapshot(async () => ({ data: {}, error: null }), 'a1', decision)).rejects.toThrow('does not know')
  })
})

describe('nextSettlement', () => {
  it('pays once with a provider reference and treats a replay as a no-op', () => {
    expect(nextSettlement('invoiced', { kind: 'paid', providerRef: 'in_1' })).toEqual({ status: 'paid', changed: true })
    expect(nextSettlement('paid', { kind: 'paid', providerRef: 'in_1' })).toEqual({ status: 'paid', changed: false })
    expect(nextSettlement('invoiced', { kind: 'paid', providerRef: ' ' })).toEqual({ error: 'needs_provider_ref' })
  })
  it('keeps paid and void final', () => {
    expect(nextSettlement('paid', { kind: 'void' })).toEqual({ error: 'paid_is_final' })
    expect(nextSettlement('void', { kind: 'paid', providerRef: 'x' })).toEqual({ error: 'void_is_final' })
    expect(nextSettlement('void', { kind: 'void' })).toEqual({ status: 'void', changed: false })
  })
})

describe('publicMoneyLines', () => {
  it('keeps an unpaid pledge out of donations raised', () => {
    expect(publicMoneyLines({ currency: 'USD', donationsRaisedCents: 2500, snapshot: { owedCents: 500 }, settlement: { status: 'invoiced', amountCents: 500 } })).toEqual({
      currency: 'USD', donationsRaisedCents: 2500, sponsorPledgedCents: 500, sponsorPaidCents: 0,
    })
  })
  it('moves a paid settlement from pledged to paid, and drops a void one', () => {
    expect(publicMoneyLines({ currency: 'USD', donationsRaisedCents: 0, snapshot: { owedCents: 500 }, settlement: { status: 'paid', amountCents: 500 } })).toMatchObject({ sponsorPledgedCents: 0, sponsorPaidCents: 500 })
    expect(publicMoneyLines({ currency: 'USD', donationsRaisedCents: 0, snapshot: { owedCents: 500 }, settlement: { status: 'void', amountCents: 500 } })).toMatchObject({ sponsorPledgedCents: 0, sponsorPaidCents: 0 })
  })
})
