/**
 * Refunds, disputes and consumption (FH-039, docs/hunts/REFUNDS-AND-DISPUTES.md).
 *
 * Resolve access from the CURRENT canonical settlement and the affected purchased unit. The decision is
 * pure; the effect is `hunt_entitlement_reverse`, which takes the entitlement row lock, so a refund and a
 * staff scan racing for the same unused benefit cannot both win. Money movement, receipts and transfers
 * stay with the canonical Stripe flows: this only records the access consequence.
 *
 *   full refund / lost dispute   -> revoke unused, case for consumed
 *   partial refund, units named  -> revoke only those units (consumed ones go to review)
 *   partial refund, no units     -> a review case, NEVER a guess from the amount
 *   dispute opened               -> suspend unconsumed benefits
 *   dispute won                  -> restore, but only if canonical state is still paid and unrefunded
 *
 * The reference (`ref`) is the canonical refund or dispute id, so a repeated delivery is a no-op.
 */
import type { Rpc } from './entitlements'

type ReversalEvent =
  | { kind: 'refund_full'; ref: string }
  | { kind: 'refund_partial'; ref: string; amountMinor: number; currency: string; unitKeys: readonly string[] | null }
  | { kind: 'dispute_opened'; ref: string }
  | { kind: 'dispute_lost'; ref: string }
  | { kind: 'dispute_won'; ref: string; canonicalStillPaid: boolean }

type ReversalAction = Readonly<{ mode: 'refund' | 'dispute_open' | 'dispute_lost' | 'dispute_won'; unitKey: string | null; ref: string }>
type ReviewCase = Readonly<{ kind: 'partial_unmapped'; ref: string; amountMinor: number; currency: string }>

type ReversalDecision = Readonly<{
  actions: readonly ReversalAction[]
  cases: readonly ReviewCase[]
  /** Set when a won dispute is not restored because canonical state says the money is gone. */
  restoreBlocked?: 'not_paid'
}>

/** Decide what to do with one canonical reversal event. Never infers a unit from an amount. */
export function decideReversal(event: ReversalEvent): ReversalDecision {
  switch (event.kind) {
    case 'refund_full':
      return { actions: [{ mode: 'refund', unitKey: null, ref: event.ref }], cases: [] }
    case 'refund_partial': {
      if (!event.unitKeys || event.unitKeys.length === 0) {
        return { actions: [], cases: [{ kind: 'partial_unmapped', ref: event.ref, amountMinor: event.amountMinor, currency: event.currency }] }
      }
      const units = [...new Set(event.unitKeys)].sort()
      return { actions: units.map((u) => ({ mode: 'refund' as const, unitKey: u, ref: `${event.ref}:${u}` })), cases: [] }
    }
    case 'dispute_opened':
      return { actions: [{ mode: 'dispute_open', unitKey: null, ref: event.ref }], cases: [] }
    case 'dispute_lost':
      return { actions: [{ mode: 'dispute_lost', unitKey: null, ref: event.ref }], cases: [] }
    case 'dispute_won':
      // Re-evaluate canonical state first: a dispute won after a later refund must stay revoked.
      return event.canonicalStillPaid
        ? { actions: [{ mode: 'dispute_won', unitKey: null, ref: event.ref }], cases: [] }
        : { actions: [], cases: [], restoreBlocked: 'not_paid' }
  }
}

/**
 * Pick which order-line units a quantity refund affects when the canonical evidence names a line and a
 * count but not a unit. Unused units go first, highest index first, so consumed service history is the
 * last thing touched. A consumed unit is only ever returned when no unused one is left.
 */
export function pickUnitsToRevoke(
  units: readonly Readonly<{ unitKey: string; state: 'pending_claim' | 'active' | 'suspended' | 'revoked' | 'consumed' }>[],
  count: number,
): string[] {
  if (!Number.isInteger(count) || count < 1) return []
  const idx = (k: string) => Number(k.match(/(\d+)$/)?.[1] ?? 0)
  const live = units.filter((u) => u.state !== 'revoked')
  const rank = (s: string) => (s === 'consumed' ? 1 : 0)
  return [...live]
    .sort((a, b) => rank(a.state) - rank(b.state) || idx(b.unitKey) - idx(a.unitKey))
    .slice(0, count)
    .map((u) => u.unitKey)
}

type ReverseCounts = { revoked: number; suspended: number; restored: number; cases: number }

/** Apply a decision. Each action is one serialized statement; replay with the same refs does nothing twice. */
export async function applyReversal(
  rpc: Rpc,
  source: Readonly<{ type: 'event-ticket' | 'store-order'; id: string }>,
  decision: ReversalDecision,
): Promise<ReverseCounts & { reviewOpened: number }> {
  const total: ReverseCounts = { revoked: 0, suspended: 0, restored: 0, cases: 0 }
  for (const a of decision.actions) {
    const { data, error } = await rpc('hunt_entitlement_reverse', {
      p_source_type: source.type,
      p_source_id: source.id,
      p_unit_key: a.unitKey,
      p_mode: a.mode,
      p_ref: a.ref,
    })
    if (error) throw new Error(`hunt_entitlement_reverse failed: ${error.message}`)
    const r = (data ?? {}) as Partial<ReverseCounts>
    total.revoked += r.revoked ?? 0
    total.suspended += r.suspended ?? 0
    total.restored += r.restored ?? 0
    total.cases += r.cases ?? 0
  }
  let reviewOpened = 0
  for (const c of decision.cases) {
    const { data, error } = await rpc('hunt_refund_case_open', {
      p_source_type: source.type,
      p_source_id: source.id,
      p_unit_key: null,
      p_kind: c.kind,
      p_ref: c.ref,
      p_amount_minor: c.amountMinor,
      p_currency: c.currency.toUpperCase(),
    })
    if (error) throw new Error(`hunt_refund_case_open failed: ${error.message}`)
    if (data === true) reviewOpened += 1
  }
  return { ...total, reviewOpened }
}
