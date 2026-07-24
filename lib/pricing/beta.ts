// BETA PRICING WINDOW (ADR-811 go-live). The Community Collective launches with BETA anchor pricing:
// Business $19 (under the $29 list) and Collective $49 (under the $79 list). These beta anchors are the
// CHARGED price for everyone who subscribes before the cutover; on the cutover instant the checkout
// begins charging the LIST price instead, and the pricing surfaces drop the beta framing. This is the
// auto-revert: no manual step, no re-sync (both the beta and list Stripe prices are minted active by the
// catalog sync, so the checkout just resolves the other key past the deadline).
//
// GRANDFATHERING: a Space that subscribes during the beta window keeps its rate for life. Its founding
// (beta) Stripe price id is persisted as the locked price on its subscription item, and the loadout
// checkout re-bills that lock before ever consulting this window (space-plan-checkout.ts
// resolveLoadoutPriceId). So only a NEW subscriber, subscribing AFTER the cutover, pays list.
//
// PURE + framework-free (no Supabase/Next), like the rest of lib/pricing/*: it takes `now` (defaulted to
// the live clock at the one call site that reads it) so every consumer stays testable with a fixed date.

import type { CatalogAmounts } from '@/lib/billing/pricing-keys'

/** The instant the beta window closes: midnight Pacific on 2026-09-01 (PDT = UTC-7), i.e. beta pricing is
 *  offered through the end of Aug 31 Pacific and list pricing takes over on Sep 1. Owner-editable: moving
 *  this one constant shifts the whole auto-revert (checkout price + every pricing surface). */
export const BETA_PRICING_ENDS_AT = '2026-09-01T07:00:00.000Z'

/** Is the beta anchor pricing still in effect at `now`? True before the cutover, false on/after it.
 *  FAIL-SAFE: an unparseable constant would make this false (charge list, never under-charge). */
export function isBetaPricingActive(now: Date = new Date()): boolean {
  const cutover = Date.parse(BETA_PRICING_ENDS_AT)
  if (!Number.isFinite(cutover)) return false
  return now.getTime() < cutover
}

/** The amounts a pricing SURFACE should show given the beta window: during beta, the real {founding, list}
 *  split (a struck list over the beta anchor); after beta, list becomes the charged price and the founding
 *  anchor collapses to it, so no strike / no beta caption renders. PURE. Mirrors what the checkout charges
 *  (the founding key during beta, the list key after), so display and billing never diverge. */
export function effectiveCatalogAmounts(amounts: CatalogAmounts, betaActive: boolean): CatalogAmounts {
  if (betaActive) return amounts
  return { listCents: amounts.listCents, foundingCents: amounts.listCents }
}
