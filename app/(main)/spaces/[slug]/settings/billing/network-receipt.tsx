import { formatCents } from '@/lib/pricing/display'
import type { SpaceEarnings } from '@/lib/commerce/orders'

// THE NETWORK RECEIPT (Phase 5, ADR-811 §A) — the honest receipt that makes brand promise #4 provable:
// "see exactly what the network earned you." It reads the network-sourced split of a Space's settled
// commerce earnings and states, plainly, what the collective sourced this month and what our take on that
// slice was. It is the flip side of the promise: we take 0% on your own bookings, and here, in dollars, is
// the only business we earned on.
//
// PRESENTATIONAL + FAIL-SAFE: renders nothing when the network sourced nothing (no empty brag, no zero-
// state guilt). No em dashes, no narrated feelings, no hype (CONTENT-VOICE §10). Money via the shared
// formatCents so it reads identically to the rest of pricing.

/** The trailing window the receipt summarizes, so the copy can name it ("this month"). */
const WINDOW_LABEL = 'the last 30 days'

export function NetworkReceipt({ earnings }: { earnings: SpaceEarnings }) {
  // Nothing network-sourced yet → show nothing. The receipt only ever states a real, positive figure.
  if (earnings.networkOrderCount <= 0 || earnings.networkGrossCents <= 0) return null

  const netToYouCents = Math.max(0, earnings.networkGrossCents - earnings.networkFeeCents)
  const orders = earnings.networkOrderCount

  return (
    <section
      aria-labelledby="network-receipt-heading"
      className="rounded-2xl border border-success/30 bg-success-bg/15 px-5 py-4 shadow-sm"
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-success">The network earned you</p>
      <p id="network-receipt-heading" className="mt-1 text-2xl font-black text-text">
        {formatCents(earnings.networkGrossCents)}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        From {orders} {orders === 1 ? 'sale' : 'sales'} the collective sent you over {WINDOW_LABEL}. You
        kept {formatCents(netToYouCents)}. Our take on that network-sourced business was{' '}
        {formatCents(earnings.networkFeeCents)}, and we took nothing on the rest of what you brought in
        yourself.
      </p>
    </section>
  )
}
