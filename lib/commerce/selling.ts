// The selling role/permission gate (Phase 0, Etsy-Grade Market). These pure predicates are the
// SINGLE source of truth for who may take in-app payments and who may list a New product, so the
// rule is trivial to widen later. No IO — keep it importable from both client and server.

import type { OwnerKind } from './types'

/**
 * R2 — may this owner take IN-APP PAYMENTS (open a Stripe Checkout)?
 *
 * EVERY owner kind may. A Business Space Shop ('space'), the Frequency Store ('platform'), and —
 * since the 2026-09-08 owner ruling (`OWN-046`) — an individual maker ('profile'). Member-to-member
 * Market sales settle in-app.
 *
 * 🔴 THIS PREDICATE IS NOW CONSTANT, AND IT IS KEPT RATHER THAN INLINED ON PURPOSE. It is the ONE
 * gate the checkout path (lib/commerce/checkout.ts:144) and the product render
 * (app/(main)/market/[id]/page.tsx:130) both read, and the header above has always named it as the
 * place a future `charges_enabled` check ANDs in. Deleting it would scatter that decision across
 * two call sites the day someone needs to narrow it again.
 *
 * ⚠️ IT IS NOT THE ONLY THING BETWEEN A LISTING AND A CHARGE, and reading it as such would be the
 * mistake. Two independent guards survive and are what actually keep money safe:
 *   · `payoutsLive()` (lib/billing/connect.ts:30) — `billingEnabled() && hostPayoutsEnabledFlag()`,
 *     fail-closed on the `host_payouts_enabled` platform flag. The master switch.
 *   · Connect readiness (lib/commerce/checkout.ts:69) — a seller with no `accountId`, or not
 *     `ready`, is refused per-order regardless of role.
 * A maker who has not onboarded now sees a Buy button and is refused at click. That is the
 * intended shape (the funnel is the point), not an oversight.
 *
 * 📌 `canListNew` below is a SEPARATE ruling and did NOT move: an individual still lists Used only.
 *
 * PURE.
 */
export function canTakePayments(ownerKind: OwnerKind): boolean {
  return ownerKind === 'space' || ownerKind === 'platform' || ownerKind === 'profile'
}

/**
 * R3 — may this owner list a NEW product? A New listing is a Business feature: only a Business Space
 * Shop ('space') or the Frequency Store ('platform') may list New. An individual maker ('profile')
 * may list Used only. PURE.
 */
export function canListNew(ownerKind: OwnerKind): boolean {
  return ownerKind === 'space' || ownerKind === 'platform'
}
