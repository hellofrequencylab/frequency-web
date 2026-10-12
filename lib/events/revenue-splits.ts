// REVENUE SPLITS ON A CO-HOSTED EVENT (LIVE-767, ADR-1709 phase 8).
//
// An Event's home Space owner can give each accepted Collaborator Space (an event_space_shares row,
// lib/events/event-share.ts) a share of every ticket, in basis points. When at least one share is
// payable the ticket checkout stops being a destination charge to one host and takes the Market's
// SEPARATE plan (lib/commerce/funds-flow.ts, ADR-1576): one charge on the platform carrying
// `transfer_group`, one commerce_orders row with `funds_flow = 'separate'` and `metadata.split`, and
// LIVE-622's ledger (lib/commerce/transfers.ts) pays each Space by transfer once the ticket settles.
// A refund takes each share back pro rata through lib/commerce/split-refund.ts, keyed on the
// PaymentIntent, exactly as a Market split refund does.
//
// THE RULE, in one place:
//   * only the home Space's OWNER sets shares, and only for Spaces that are accepted Collaborators
//     on that Event today (a revoked share is refused at set time and dropped at checkout);
//   * the Collaborators' shares together take at most COLLABORATOR_SPLIT_MAX_BPS: the home Space
//     keeps at least the platform's top network rung (500 bps, the `paid` rung in
//     lib/billing/pricing-keys.ts) so the host of record always has a share to settle against;
//   * every payee Space must have payouts live (lib/billing/connect.ts: the operator switch and the
//     owner's connected account ready) or the set is refused;
//   * the platform fee is the one the home Space's rung priced on the whole gross (the ticket
//     receipt is unchanged); it is taken from every share pro rata, floored, remainder to the home
//     Space, so the shares' gross sums to the charge and their fees sum to the fee the row records.
//
// This file is the PURE half, what the probe and the tests exercise, and it imports nothing that
// reaches a database or a key so a plain node process can load it. The store half is
// ./revenue-splits-store.ts: it reads the service-role client and fails safe to "no split" (a
// destination charge to the host, today's path) on any miss.

import type { SellerSplit } from '@/lib/commerce/funds-flow'

/** The home Space keeps at least this much: the platform's top network rung (ADR-1709 §4). */
const HOME_SPACE_MIN_BPS = 500
export const COLLABORATOR_SPLIT_MAX_BPS = 10000 - HOME_SPACE_MIN_BPS

export interface SplitShareInput {
  spaceId: string
  bps: number
}

type SplitRefusal = 'not_collaborator' | 'bad_bps' | 'over_cap' | 'duplicate' | 'payouts_not_ready'

/**
 * Validate a set of shares against the Event's accepted Collaborators and their payout readiness.
 * PURE. A zero share is a removal and is dropped, not refused.
 */
export function validateRevenueSplits(
  shares: readonly SplitShareInput[],
  ctx: { collaboratorSpaceIds: readonly string[]; readySpaceIds: readonly string[] },
): { ok: true; shares: SplitShareInput[] } | { refused: SplitRefusal; spaceId?: string } {
  const seen = new Set<string>()
  const kept: SplitShareInput[] = []
  let total = 0
  for (const share of shares) {
    if (!Number.isInteger(share.bps) || share.bps < 0 || share.bps > 10000) return { refused: 'bad_bps', spaceId: share.spaceId }
    if (seen.has(share.spaceId)) return { refused: 'duplicate', spaceId: share.spaceId }
    seen.add(share.spaceId)
    if (share.bps === 0) continue
    if (!ctx.collaboratorSpaceIds.includes(share.spaceId)) return { refused: 'not_collaborator', spaceId: share.spaceId }
    if (!ctx.readySpaceIds.includes(share.spaceId)) return { refused: 'payouts_not_ready', spaceId: share.spaceId }
    total += share.bps
    kept.push({ spaceId: share.spaceId, bps: share.bps })
  }
  if (total > COLLABORATOR_SPLIT_MAX_BPS) return { refused: 'over_cap' }
  return { ok: true, shares: kept }
}

/** A Space the checkout can pay: its owner's connected account, as priced at checkout. */
export interface SplitPayee {
  spaceId: string
  ownerProfileId: string
  stripeAccountId: string
  bps: number
}

/**
 * The per-seller shares of one ticket charge. PURE.
 *
 * INVARIANT (the one lib/commerce/transfers.ts refuses an order without): the shares' gross sums to
 * `grossCents` and their fees sum to `platformFeeCents`. Each Collaborator takes floor(gross x bps)
 * and floor(fee x its gross / gross); the home Space takes both remainders. A Collaborator whose
 * share floors to nothing is folded into the home Space. The home Space is always first.
 */
export function planTicketSplit(input: {
  grossCents: number
  platformFeeCents: number
  home: { spaceId: string; ownerProfileId: string; stripeAccountId: string }
  payees: readonly SplitPayee[]
}): SellerSplit[] {
  const gross = Math.max(0, Math.floor(input.grossCents))
  const fee = Math.min(gross, Math.max(0, Math.floor(input.platformFeeCents)))
  const seller = (p: { spaceId: string; ownerProfileId: string }) => ({
    owner_kind: 'space' as const,
    owner_profile_id: p.ownerProfileId,
    owner_space_id: p.spaceId,
  })
  const shares: SellerSplit[] = []
  let grossLeft = gross
  let feeLeft = fee
  for (const payee of input.payees) {
    if (payee.spaceId === input.home.spaceId) continue
    const bps = Math.min(10000, Math.max(0, Math.floor(payee.bps)))
    const share = Math.floor((gross * bps) / 10000)
    if (share <= 0) continue
    const shareFee = gross > 0 ? Math.floor((fee * share) / gross) : 0
    shares.push({ seller: seller(payee), grossCents: share, platformFeeCents: shareFee, stripeAccountId: payee.stripeAccountId })
    grossLeft -= share
    feeLeft -= shareFee
  }
  return [
    { seller: seller(input.home), grossCents: grossLeft, platformFeeCents: feeLeft, stripeAccountId: input.home.stripeAccountId },
    ...shares,
  ]
}

/** The `metadata.split` shape LIVE-622's planner reads (lib/commerce/transfers.ts planTransferShares). */
export function splitMetadata(splits: readonly SellerSplit[]): Record<string, unknown>[] {
  return splits.map((s) => ({
    owner_kind: s.seller.owner_kind,
    owner_profile_id: s.seller.owner_profile_id,
    owner_space_id: s.seller.owner_space_id,
    stripe_account_id: s.stripeAccountId,
    gross_cents: s.grossCents,
    platform_fee_cents: s.platformFeeCents,
  }))
}

/** The owner's sentence for each refusal. The percent figures follow COLLABORATOR_SPLIT_MAX_BPS. */
export const SPLIT_REFUSAL_COPY: Record<SplitRefusal, string> = {
  not_collaborator: 'Only an accepted Collaborator on this event can take a share.',
  bad_bps: 'A share is a whole number of percent between 0 and 95.',
  over_cap: 'Shares together can take at most 95%. Your Space keeps the rest.',
  duplicate: 'Each Collaborator can have one share.',
  payouts_not_ready: 'That Space has not finished setting up payouts yet, so it cannot take a share.',
}
