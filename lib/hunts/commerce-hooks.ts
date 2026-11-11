/**
 * The call sites for Hunt benefits (FH-037S): the Stripe webhook, the checkout return and the repair cron
 * reach the money store only through here.
 *
 * Two rules, both from docs/hunts/REFUNDS-AND-DISPUTES.md:
 *  - BEST EFFORT. A failure here never fails settlement: the ticket is already recorded and the buyer has
 *    paid, so the webhook still answers 2xx.
 *  - NEVER SILENT. A swallowed failure leaves a pending `hunt_commerce_intents` row carrying the error, which
 *    the repair scan retries with backoff and the finance view counts. A failure that wrote nothing is the
 *    only invisible one, so `guarded` reports it loudly instead of returning quietly.
 *
 * Everything is off until HUNTS_COMMERCE_ENABLED (and HUNTS_ENABLED) are on.
 */
import type Stripe from 'stripe'
import { huntSwitchOn } from './flags'
import { applyReversal, decideReversal, type ReversalDecision } from './refunds'
import type { Rpc } from './entitlements'
import { attachAttendee, intentRetryMinutes } from './entitlements'

/** The charge-level reversal a refund event means. Pure, so the whole event matrix is testable. */
export function reversalForCharge(charge: Pick<Stripe.Charge, 'id' | 'amount' | 'amount_refunded' | 'currency'>): ReversalDecision | null {
  const refunded = charge.amount_refunded ?? 0
  if (refunded <= 0) return null
  // The reference is the canonical charge plus the cumulative refunded amount: a repeated delivery of the
  // same refund has the same reference, a later refund of more money has a different one.
  const ref = `${charge.id}:${refunded}`
  if (refunded >= (charge.amount ?? 0)) return decideReversal({ kind: 'refund_full', ref })
  // The amount alone never names a seat, so a partial refund opens a review case instead of guessing.
  return decideReversal({ kind: 'refund_partial', ref, amountMinor: refunded, currency: charge.currency ?? 'usd', unitKeys: null })
}

/** What a closed dispute means. Only a decided one changes access; `canonicalStillPaid` guards a restore. */
export function reversalForDispute(
  dispute: Pick<Stripe.Dispute, 'id' | 'status'>,
  canonicalStillPaid: boolean,
): ReversalDecision | null {
  if (dispute.status === 'lost') return decideReversal({ kind: 'dispute_lost', ref: dispute.id })
  if (dispute.status === 'won') return decideReversal({ kind: 'dispute_won', ref: dispute.id, canonicalStillPaid })
  return null
}

/**
 * Run one hook so it can never throw into settlement. `onFailure` is told what failed and must leave a
 * record; if even that fails the error is logged with a stable prefix the log drain alerts on.
 */
export async function guarded(
  label: string,
  fn: () => Promise<void>,
  onFailure: (message: string) => Promise<void>,
  enabled: () => boolean = () => huntSwitchOn('commerce'),
): Promise<'skipped' | 'ok' | 'failed'> {
  if (!enabled()) return 'skipped'
  try {
    await fn()
    return 'ok'
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    try {
      await onFailure(`${label}: ${message}`.slice(0, 300))
    } catch (inner) {
      console.error(`[hunts-commerce] UNRECORDED FAILURE ${label}: ${message} (record also failed: ${String(inner)})`)
    }
    return 'failed'
  }
}

/** Backoff for the next attempt after a failure, null once it should go to human review. */
export function nextIntentState(attempts: number, now: number): { status: 'pending' | 'review'; nextAttemptAt: string } {
  const minutes = intentRetryMinutes(attempts + 1)
  return minutes === null
    ? { status: 'review', nextAttemptAt: new Date(now).toISOString() }
    : { status: 'pending', nextAttemptAt: new Date(now + minutes * 60_000).toISOString() }
}

/** Apply a charge reversal to the ticket that owns the charge. No-op for a charge that is not a bound ticket. */
export async function applyChargeReversal(rpc: Rpc, ticketId: string, decision: ReversalDecision | null): Promise<void> {
  if (!decision) return
  await applyReversal(rpc, { type: 'event-ticket', id: ticketId }, decision)
}

/** A verified attendee claimed a paid guest seat: activate that seat's pending benefits once. */
export async function activateClaimedSeat(rpc: Rpc, ticketId: string, unitKey: string, profileId: string): Promise<number> {
  return attachAttendee(rpc, ticketId, unitKey, profileId)
}
