/**
 * The capped sponsor milestone (FH-047): storage-facing half of lib/hunts/graph/sponsor-milestone-math.ts.
 *
 * What is guaranteed, and where:
 *   - Distinct confirmed qualifications are counted once (the math takes a set of canonical keys).
 *   - The threshold is FROZEN once, in `hunt_sponsor_snapshots`, unique per agreement. A replayed event
 *     or a later fraud correction returns the first snapshot and never re-prices it.
 *   - One cap per Hunt, no rollover, expires at Hunt end, rounds down to whole cents (the math).
 *   - The settlement is unique per snapshot, so it is invoiced once. Sponsor payment is reconciled
 *     independently: only a settlement with a provider reference and `paid` is ever called paid.
 *   - An unpaid pledge is never published as donations raised: `publicMoneyLines` keeps raised donations,
 *     sponsor pledged and sponsor paid as three separate lines.
 * FH-045 (D8) approval gates real money; an agreement is inert until it is active with an approver.
 */
import { sponsorMilestoneOwedCents } from './graph/sponsor-milestone-math'
import type { Rpc } from './entitlements'

export type SponsorAgreement = Readonly<{
  id: string
  huntId: string
  threshold: number
  capCents: number
  pledgeNumerator: number
  pledgeDenominator: number
  status: 'draft' | 'active' | 'void'
  approvedAt: string | null
  approvedBy: string | null
}>

type FreezeDecision =
  | { freeze: true; keys: string[]; owedCents: number; huntEndsAt: string }
  | { freeze: false; reason: 'not_active' | 'not_approved' | 'threshold_not_reached' | 'after_hunt_end' | 'nothing_owed' }

/**
 * Decide whether the threshold can freeze now. `confirmedKeys` are canonical keys of CONFIRMED
 * qualifications only (never pending, held or reversed claims); the caller reads them from confirmed
 * results, and duplicates are collapsed here.
 */
export function decideFreeze(input: {
  agreement: SponsorAgreement
  confirmedKeys: readonly string[]
  nowMs: number
  huntEndsAtMs: number
}): FreezeDecision {
  const { agreement, nowMs, huntEndsAtMs } = input
  if (agreement.status !== 'active') return { freeze: false, reason: 'not_active' }
  if (!agreement.approvedAt || !agreement.approvedBy) return { freeze: false, reason: 'not_approved' }
  if (nowMs >= huntEndsAtMs) return { freeze: false, reason: 'after_hunt_end' }
  const keys = [...new Set(input.confirmedKeys.filter(Boolean))].sort()
  if (keys.length < agreement.threshold) return { freeze: false, reason: 'threshold_not_reached' }
  const owed = sponsorMilestoneOwedCents({
    frozenAtMs: nowMs,
    confirmedQualificationKeys: keys,
    threshold: agreement.threshold,
    huntEndsAtMs,
    capCents: BigInt(agreement.capCents),
    pledgeCents: { numerator: BigInt(agreement.pledgeNumerator), denominator: BigInt(agreement.pledgeDenominator) },
  })
  if (owed <= BigInt(0)) return { freeze: false, reason: 'nothing_owed' }
  if (owed > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Sponsor amount is too large to record')
  return { freeze: true, keys, owedCents: Number(owed), huntEndsAt: new Date(huntEndsAtMs).toISOString() }
}

/** Freeze the snapshot. Idempotent: the second call returns the first snapshot, `created: false`. */
export async function freezeSnapshot(
  rpc: Rpc,
  agreementId: string,
  decision: Extract<FreezeDecision, { freeze: true }>,
): Promise<{ snapshotId: string; owedCents: number; created: boolean }> {
  const { data, error } = await rpc('hunt_sponsor_freeze', {
    p_agreement_id: agreementId,
    p_hunt_ends_at: decision.huntEndsAt,
    p_keys: decision.keys,
    p_owed_cents: decision.owedCents,
  })
  if (error) throw new Error(`hunt_sponsor_freeze failed: ${error.message}`)
  const r = data as { snapshot_id?: string; owed_cents?: number; created?: boolean } | null
  if (!r?.snapshot_id || typeof r.owed_cents !== 'number') throw new Error('hunt_sponsor_freeze returned an answer this build does not know')
  return { snapshotId: r.snapshot_id, owedCents: r.owed_cents, created: r.created === true }
}

type SettlementStatus = 'invoiced' | 'paid' | 'void'

/** One settlement lifecycle step. A replay is a no-op; paid needs the provider's own reference; paid is final. */
export function nextSettlement(
  current: SettlementStatus,
  event: { kind: 'paid'; providerRef: string } | { kind: 'void' },
): { status: SettlementStatus; changed: boolean } | { error: 'paid_is_final' | 'needs_provider_ref' | 'void_is_final' } {
  if (event.kind === 'paid') {
    if (!event.providerRef.trim()) return { error: 'needs_provider_ref' }
    if (current === 'paid') return { status: 'paid', changed: false }
    if (current === 'void') return { error: 'void_is_final' }
    return { status: 'paid', changed: true }
  }
  if (current === 'void') return { status: 'void', changed: false }
  if (current === 'paid') return { error: 'paid_is_final' }
  return { status: 'void', changed: true }
}

type MoneyLines = Readonly<{
  currency: string
  donationsRaisedCents: number
  sponsorPledgedCents: number
  sponsorPaidCents: number
}>

/**
 * What a public page may say. Raised donations are settled gifts only. A sponsor pledge appears as
 * pledged until its settlement is paid, and is never added to the donations line.
 */
export function publicMoneyLines(input: {
  currency: string
  donationsRaisedCents: number
  snapshot: Readonly<{ owedCents: number }> | null
  settlement: Readonly<{ status: SettlementStatus; amountCents: number }> | null
}): MoneyLines {
  const paid = input.settlement?.status === 'paid' ? input.settlement.amountCents : 0
  const pledged = input.snapshot && input.settlement?.status !== 'void' ? input.snapshot.owedCents : 0
  return {
    currency: input.currency,
    donationsRaisedCents: Math.max(0, input.donationsRaisedCents),
    sponsorPledgedCents: Math.max(0, pledged - paid),
    sponsorPaidCents: paid,
  }
}
