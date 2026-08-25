// ── Who may SELL a ticket (ADR-914, superseding ADR-913) ───────────────────────────────────────
//
// Owner ruling, 2026-07-30: **a free Member can sell.** The rate differs, the permission does not.
//
// This module previously held the opposite rule — selling tickets was a Crew unlock — and reversing it
// is the single highest-value change in the value-ladder build (docs/VALUE-LADDER.md Phase 1). The
// reasoning, recorded here because the temptation to re-add the wall will recur:
//
// A free Member who wants to charge $10 a head for a house show, and hits a paywall, does not upgrade.
// They send people to Venmo. That is a PERMANENT loss, because neither the transaction nor the contact
// ever touched Frequency, and there is now a working habit that routes around the product. The wall
// bought nothing and cost everything.
//
// So the wall moved off the transaction and onto the repeat. Selling is free on every tier; what the
// paid tiers buy is a lower rate (10% → 8% → 5% → 3%) and the tools that build the list which takes the
// rate to 0%. A seller's own success is what pushes them up the ladder, which is a far stronger engine
// than a locked button. **Never gate the transaction. Gate the repeat.**
//
// 🔴 WHAT IS LEFT IS NOT A GATE. One condition still stops money moving: the payee must have a Stripe
// Express account that has completed onboarding. That is a legal and banking fact, not a tier — Stripe
// will not move money to an unverified account at any price. Modelling it as a SETUP STEP rather than a
// permission is the whole point of this rewrite, because the two produce completely different surfaces:
// a gate says "you cannot", a setup step says "two minutes and you can".
//
// That distinction is load-bearing right now. Production has exactly ONE profile with a Stripe account
// and ZERO with onboarding complete, so nobody on the platform can receive money at all. The funnel is
// open and correctly guarded; it has no completions because nothing ever asks. Hence the ruling that
// onboarding is triggered AT FIRST SALE, on the surface where someone has just decided to charge, and
// never buried in a settings page nobody visits.

/** What the seller still has to do before this event can take money. `null` = nothing, sell away. */
export type TicketSetupStep = 'connect_payouts' | null

export interface TicketSellerContext {
  /**
   * Has the payee's Stripe Express account completed onboarding (`charges_enabled && payouts_enabled`)?
   *
   * Passed in rather than read here so this stays PURE: the price can be written at four independent
   * seams (the create/edit form, the settings module, the host ticket-tier panel, the admin console)
   * and is read at a fifth (the buy path), and a pure predicate is the only shape where all five get
   * the same answer without five round trips.
   */
  payoutsReady?: boolean | null
}

export type TicketSellerVerdict = { allowed: true; step: null } | { allowed: false; step: TicketSetupStep; reason: string }

/** The one seller-facing line, so every seam says the same sentence. Not a refusal: an invitation with
 *  a next action. CONTENT-VOICE §10 — plain, no guilt, names the time cost honestly. */
export const NEEDS_PAYOUT_ACCOUNT =
  'Add a payout account to start selling tickets. It takes about two minutes, and the money lands in your bank.'

/** What a BUYER sees when the seller has not finished setup. A stranger is never told anything about
 *  the host's account state. */
export const TICKETS_NOT_READY = 'Tickets aren’t on sale for this event yet.'

/**
 * May this event sell tickets?
 *
 * ONE condition, on every tier: the payee can actually receive money. No tier, no plan, no membership
 * check — a free Member, a free Space, and a Collective all clear this identically.
 *
 * PURE and total. Fail-closed on the setup question (an unknown `payoutsReady` reads as not ready),
 * which is the safe direction here for a reason that is worth stating: letting a buyer pay into an
 * account Stripe cannot pay out of does not "under-collect", it takes someone's money and strands it.
 */
export function ticketSellerVerdict(ctx: TicketSellerContext): TicketSellerVerdict {
  if (ctx.payoutsReady === true) return { allowed: true, step: null }
  return { allowed: false, step: 'connect_payouts', reason: NEEDS_PAYOUT_ACCOUNT }
}

/** Convenience boolean for render-time branching (showing the connect step beside a price control). */
export function canSellTickets(ctx: TicketSellerContext): boolean {
  return ticketSellerVerdict(ctx).allowed
}

// ── Publishing the verdict's ONE input to a render (LIVE-126, ADR-1162) ────────────────────────
//
// `payoutsReady` is the whole context, and the surface that most needs it — the price control on the
// event form — cannot read it: the payee is not the caller on a space-hosted event, and on CREATE the
// scope is not chosen until the host picks it. So the server resolves readiness for EVERY scope the
// host can pick and publishes it as a map; the form looks up whichever scope is selected right now.
//
// WHY A KEY FUNCTION RATHER THAN THE RAW SELECT VALUE. The form encodes its scope <select> three ways
// — a sentinel for a public event, a bare id for a circle, and a `space:`-prefixed id for a space —
// and the edit page seeds the same state from a bare `scope_id`. A map keyed on the raw value would
// silently miss on whichever page encodes differently, and a miss reads as "not ready", so the bug
// would be an invisible nag rather than a crash. Both sides call this instead.
//
// AN ABSENT KEY IS NOT READY, deliberately and in agreement with `ticketSellerVerdict` above: an
// unknown payee is exactly the case where we must not tell a host the money will land.

/** The map key for a scope whose payee is the caller themselves (a public event). */
export const PAYOUT_SCOPE_SELF = 'self'

/** The key a scope's payout readiness is published under. Pure; total; accepts every encoding the
 *  event form's scope state can hold. */
export function payoutScopeKey(scopeId: string | null | undefined): string {
  if (!scopeId || scopeId === '__public__') return PAYOUT_SCOPE_SELF
  return scopeId.startsWith('space:') ? scopeId.slice('space:'.length) : scopeId
}
