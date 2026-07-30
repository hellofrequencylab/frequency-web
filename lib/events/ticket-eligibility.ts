import { isPaid } from '@/lib/core/access-matrix'
import { deriveTier } from '@/lib/core/entitlement'
import type { EntitlementTier } from '@/lib/core/entitlement'

// ── Who may SELL a ticket (ADR-913) ────────────────────────────────────────────────────────
//
// Owner ruling, 2026-07-30: *"A member can create an event but must upgrade to Crew or Space to take
// tickets. Members can have RSVP."*
//
// So a free Member gets the whole event product — create it, publish it, take RSVPs, run the door —
// and the one thing behind the paywall is charging money for it. That is the highest-intent upgrade
// moment in the product, and until now it was a dead end: `lib/pricing/gates.ts` has carried
// `event_paid_tickets: { axis: 'tier', minEntitlement: 'crew', enabled: true }` since the gate
// catalogue was written, with ladder copy already drafted in lib/pricing/feature-tiers.ts — and
// **no call site anywhere in the repo**. A free Member could set a price, publish, and the buyer hit
// "Tickets aren't available for this event yet" with nothing to act on.
//
// 🔴 WHY A SHARED PREDICATE AND NOT AN INLINE CHECK. The price can be set at FOUR independent seams
// (the create/edit form's flat `price_cents`, the settings module's price field, the host ticket-tier
// panel, and the admin console) and read at a fifth (the buy path). Any one of them left ungated is
// a way to charge money the tier does not allow. One function, called by all of them, is the only
// shape where "is this gated?" has a single answer.

export interface TicketSellerContext {
  /** The hosting Space, when a Space hosts the event (`events.host_space_id`). */
  hostSpaceId?: string | null
  /**
   * The payee's REAL membership tier — `profiles.membership_tier`, never the beta-granted one.
   *
   * ⚠️ REAL, not effective. `BETA_OPEN_ACCESS` makes `resolveCaller` report a granted tier so the
   * beta feels open, and every other creation gate in the repo deliberately reads
   * `realMembershipTier` for exactly this reason (market/sell, journeys/new, commerce-actions). A
   * money gate that read the granted tier would let the whole beta population charge cards.
   */
  payeeMembershipTier?: EntitlementTier | string | null
}

export type TicketSellerVerdict = { allowed: true; reason: null } | { allowed: false; reason: string }

/** The one member-facing refusal, so all five seams say the same sentence. */
export const TICKETS_NEED_CREW =
  'Selling tickets is part of Crew. Your event can take free RSVPs on any account, and upgrading also gets you 0% on everyone who is already yours.'

/**
 * May this event sell tickets?
 *
 * TWO ways to qualify, matching the owner ruling:
 *   • a SPACE hosts it — any Business / Non Profit Space, on any plan. Money was never the Space wall
 *     (ADR-552); the plan changes the RATE, not the permission.
 *   • or the personal payee is on a paid tier (Crew, which `deriveTier` also folds `supporter` into).
 *
 * PURE, so the four write seams and the buy path can all call it without a round trip. Fail-closed:
 * an unknown tier narrows to 'free' through `deriveTier` and is refused.
 */
export function ticketSellerVerdict(ctx: TicketSellerContext): TicketSellerVerdict {
  if (ctx.hostSpaceId?.trim()) return { allowed: true, reason: null }
  const tier = deriveTier((ctx.payeeMembershipTier as EntitlementTier | null | undefined) ?? null)
  if (isPaid(tier)) return { allowed: true, reason: null }
  return { allowed: false, reason: TICKETS_NEED_CREW }
}

/** Convenience boolean for render-time gating (the upgrade lightbox around a price control). */
export function canSellTickets(ctx: TicketSellerContext): boolean {
  return ticketSellerVerdict(ctx).allowed
}
