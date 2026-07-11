// Cancellation / no-show ENFORCEMENT for bookable services (ADR-596, finding #4). PURE money math,
// no IO — fully unit-testable (./cancellation.test.ts). A booking-backed commerce order is charged
// the full price up front (deposit-only billing is a deferred follow-on); when that order is
// cancelled/refunded, this decides how much of the paid amount comes BACK and how much the seller
// keeps as a cancellation/no-show fee, per the service's ServiceConfig policy.
//
// The wiring lives in lib/commerce/checkout.ts (refundCommerceOrder), which reads the booking +
// the product's ServiceConfig and issues a PARTIAL Stripe refund equal to refundCents. Everything
// here is pure so the policy is trivially testable and the refund path stays fail-soft.

/** Inputs to the refund computation. `startsAt`/`now` accept an ISO string or a Date. */
export interface BookingRefundInput {
  /** What the buyer actually paid, in cents (the settled order amount). */
  paidCents: number
  /** When the booked appointment starts. */
  startsAt: string | Date
  /** The moment the cancellation is being processed. */
  now: string | Date
  /** Hours before the start that free cancellation closes (ServiceConfig.cancellationWindowHours). */
  cancellationWindowHours?: number | null
  /** Late-cancel / no-show fee as a percent of paidCents (ServiceConfig.noShowFeePct). */
  noShowFeePct?: number | null
}

export interface BookingRefundResult {
  /** Cents to refund to the buyer. */
  refundCents: number
  /** Cents the seller keeps as the fee (paidCents - refundCents). */
  feeCents: number
  /** Why: `full` = free cancellation, `late` = inside the window, `noshow` = at/after start. */
  reason: 'full' | 'late' | 'noshow'
}

function ms(v: string | Date): number {
  return v instanceof Date ? v.getTime() : new Date(v).getTime()
}

/**
 * How much of a booking-backed order to refund, given the service's cancellation policy. PURE.
 *
 * Rules:
 *  - No policy (null/0 fee OR null window) → FULL refund, zero fee, reason 'full'.
 *  - `now` at/after `startsAt` → NO-SHOW: fee = round(paidCents * feePct/100), reason 'noshow'.
 *  - `now` within `cancellationWindowHours` before `startsAt` → LATE: same fee, reason 'late'.
 *  - Earlier than the window → FULL refund, reason 'full'.
 *
 * The fee is clamped to [0, paidCents] (so a >100% fee never makes the refund negative, and a
 * 100% fee zeroes it). paidCents is coerced to a non-negative integer. Any unparseable date
 * degrades to a full refund (fail-safe).
 */
export function computeBookingRefundCents(input: BookingRefundInput): BookingRefundResult {
  const paid = Math.max(0, Math.round(Number(input.paidCents) || 0))
  const full = (): BookingRefundResult => ({ refundCents: paid, feeCents: 0, reason: 'full' })

  const feePct = input.noShowFeePct
  const windowHours = input.cancellationWindowHours

  // No enforceable policy → always a full refund.
  if (feePct == null || !Number.isFinite(feePct) || feePct <= 0) return full()
  if (windowHours == null || !Number.isFinite(windowHours) || windowHours < 0) return full()

  const startMs = ms(input.startsAt)
  const nowMs = ms(input.now)
  if (Number.isNaN(startMs) || Number.isNaN(nowMs)) return full()

  // Fee, clamped to [0, paid]: a 100% fee zeroes the refund; a >100% fee can never go negative.
  const fee = Math.min(paid, Math.max(0, Math.round((paid * feePct) / 100)))

  // No-show: the appointment start has passed (or is exactly now).
  if (nowMs >= startMs) {
    return { refundCents: paid - fee, feeCents: fee, reason: 'noshow' }
  }
  // Late cancel: inside the free-cancellation window before the start.
  const windowMs = windowHours * 3_600_000
  if (startMs - nowMs <= windowMs) {
    return { refundCents: paid - fee, feeCents: fee, reason: 'late' }
  }
  // Comfortably ahead of the window → free cancellation.
  return full()
}
