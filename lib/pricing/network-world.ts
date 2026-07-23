// NETWORK WORLD resolution (Phase 3, ADR-811 §3). Every Space lives in ONE of two pricing worlds, switched
// by the dormant-until-now `spaces.network_connected` flag:
//
//   connected  (true)  → IN the Community Collective: the affordable ladder (Business $29 / Collective $79 /
//                        Non Profit $39), LISTED in cross-network discovery, eligible for network-sourced
//                        referrals and therefore the tier take-rate on that sourced business.
//   standalone (false) → Independent / white-label: standard SaaS pricing (~$249), WALLED OFF from discovery,
//                        and — because it has left the graph — NO network-sourced revenue by definition, so
//                        every order collapses to `self` (0% take-rate, the hard promise holds trivially).
//
// PURE + framework-independent (no Supabase/Next/React), like lib/pricing/plans.ts, so it is trivially
// unit-testable and safe to import anywhere. This is the ONE place the two-world switch is interpreted;
// callers pass the raw `network_connected` boolean and read a decision, never re-derive the rule.

import type { OrderSource } from '@/lib/billing/pricing-keys'

/** The pricing world a Space sits in, switched by `spaces.network_connected`. */
export type PricingWorld = 'connected' | 'standalone'

/** True only when the Space is explicitly network-connected (in the collective). Null/undefined (a
 *  pre-read or missing column) reads as NOT connected — default-safe: a standalone Space is never wrongly
 *  granted network reach, and its take-rate collapses to the 0% self promise. PURE. */
export function isNetworkConnected(networkConnected: boolean | null | undefined): boolean {
  return networkConnected === true
}

/** The pricing world for a Space: connected (in the collective, affordable ladder + discovery) vs standalone
 *  (Independent / white-label, standard SaaS, walled off). PURE. */
export function pricingWorldFor(networkConnected: boolean | null | undefined): PricingWorld {
  return isNetworkConnected(networkConnected) ? 'connected' : 'standalone'
}

/** The EFFECTIVE order source once the seller Space's world is applied. A standalone (disconnected) Space has
 *  left the graph, so it can have NO network-sourced revenue — every order collapses to `self` (0% take-rate,
 *  the hard promise). A connected Space keeps its classified source. PURE — this is the take-rate-eligibility
 *  half of Phase 3 (ADR-811 §3): disconnected ⇒ self/0, independent of the classifier's cookie read. */
export function effectiveOrderSource(
  source: OrderSource,
  networkConnected: boolean | null | undefined,
): OrderSource {
  return isNetworkConnected(networkConnected) ? source : 'self'
}
