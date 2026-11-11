/**
 * The separate, optional donation ask (FH-046).
 *
 * A Hunt may attach an approved beneficiary ask. The gift itself is an ordinary Space donation: the
 * existing checkout, receipt and payout authority (lib/billing/space-donation-checkout.ts) take the
 * money. A Hunt only mirrors the gift's status into `hunt_donation_gifts` to report SETTLED totals.
 *
 * Hard rules, held by the shape of this file:
 *   - Giving never changes progression. Nothing in lib/hunts/graph reads these tables, and a test
 *     keeps it that way.
 *   - Donation success, abandonment and full or partial refunds each map to one status, and totals
 *     count settled money net of refunds only. A started or abandoned gift is never "raised".
 *   - Benefactor consent to be named is its own flag. It is never inferred from an email opt-in.
 *   - Activation needs the D8 approval (FH-045). Until an approver and time are recorded, the ask is off.
 */

export type DonationAsk = Readonly<{
  huntId: string
  beneficiarySpaceId: string
  enabled: boolean
  approvedAt: string | null
  approvedBy: string | null
}>

type AskDecision = { show: true } | { show: false; reason: 'switch_off' | 'not_enabled' | 'not_approved' | 'hunt_not_open' | 'payee_not_ready' }

/** Should the ask render and accept a gift? Each reason names the gate that is closed. */
export function decideDonationAsk(input: {
  commerceSwitchOn: boolean
  ask: DonationAsk | null
  huntStatus: 'draft' | 'scheduled' | 'live' | 'paused' | 'ended' | 'cancelled' | 'archived'
  beneficiaryPayeeReady: boolean
}): AskDecision {
  if (!input.commerceSwitchOn) return { show: false, reason: 'switch_off' }
  const { ask } = input
  if (!ask || !ask.enabled) return { show: false, reason: 'not_enabled' }
  if (!ask.approvedAt || !ask.approvedBy) return { show: false, reason: 'not_approved' }
  if (input.huntStatus !== 'live' && input.huntStatus !== 'ended') return { show: false, reason: 'hunt_not_open' }
  if (!input.beneficiaryPayeeReady) return { show: false, reason: 'payee_not_ready' }
  return { show: true }
}

type GiftStatus = 'started' | 'settled' | 'abandoned' | 'refunded'

/** Map a canonical Space donation to the Hunt's mirror. A partial refund stays settled with its refunded amount. */
export function giftStatusFromDonation(donation: Readonly<{ status: 'pending' | 'succeeded' | 'refunded' | 'abandoned'; refundedMinor: number; amountMinor: number }>): {
  status: GiftStatus
  refundedMinor: number
} {
  switch (donation.status) {
    case 'pending':
      return { status: 'started', refundedMinor: 0 }
    case 'abandoned':
      return { status: 'abandoned', refundedMinor: 0 }
    case 'refunded':
      return { status: 'refunded', refundedMinor: donation.amountMinor }
    case 'succeeded': {
      const refunded = Math.min(Math.max(donation.refundedMinor, 0), donation.amountMinor)
      return refunded >= donation.amountMinor ? { status: 'refunded', refundedMinor: donation.amountMinor } : { status: 'settled', refundedMinor: refunded }
    }
  }
}

export type Gift = Readonly<{ currency: string; amountMinor: number; refundedMinor: number; status: GiftStatus }>

type SettledTotals = Readonly<{
  currency: string
  /** Money actually received and kept, net of refunds. This is the only number called "raised". */
  raisedMinor: number
  refundedMinor: number
  /** Gifts started but not paid. Reported apart, never added to raised. */
  startedMinor: number
  settledCount: number
}>

/** Totals by currency. Abandoned gifts count nowhere; started gifts count only as started. */
export function settledDonationTotals(gifts: readonly Gift[]): SettledTotals[] {
  const by = new Map<string, { raised: number; refunded: number; started: number; settled: number }>()
  for (const g of gifts) {
    const t = by.get(g.currency) ?? { raised: 0, refunded: 0, started: 0, settled: 0 }
    if (g.status === 'settled') {
      t.raised += g.amountMinor - g.refundedMinor
      t.refunded += g.refundedMinor
      t.settled += 1
    } else if (g.status === 'refunded') {
      t.refunded += g.amountMinor
    } else if (g.status === 'started') {
      t.started += g.amountMinor
    }
    by.set(g.currency, t)
  }
  return [...by.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([currency, t]) => ({ currency, raisedMinor: t.raised, refundedMinor: t.refunded, startedMinor: t.started, settledCount: t.settled }))
}

/** The name shown beside a gift. Only a benefactor who consented to be named is ever shown. */
export function publicDonorLabel(consentNamed: boolean, displayName: string | null): string {
  return consentNamed && displayName && displayName.trim() ? displayName.trim() : 'A neighbor'
}
