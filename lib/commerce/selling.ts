// The selling role/permission gate (Phase 0, Etsy-Grade Market). These pure predicates are the
// SINGLE source of truth for who may take in-app payments and who may list a New product, so the
// rule is trivial to widen later. No IO — keep it importable from both client and server.

import type { OwnerKind } from './types'

/**
 * R2 — may this owner take IN-APP PAYMENTS (open a Stripe Checkout)?
 *
 * Only a Business Space Shop ('space') or the Frequency Store ('platform') may take payments. An
 * individual maker ('profile') listing is CONNECT-ONLY: no checkout, the buyer contacts the seller.
 *
 * This is the ONE gate the checkout path and the product render both read. When Stripe onboarding
 * lands, a future `charges_enabled` check ANDs in HERE (a seller who may take payments by role must
 * also have finished Connect onboarding) — do not re-derive the role rule at the call sites.
 *
 * PURE.
 */
export function canTakePayments(ownerKind: OwnerKind): boolean {
  return ownerKind === 'space' || ownerKind === 'platform'
}

/**
 * R3 — may this owner list a NEW product? A New listing is a Business feature: only a Business Space
 * Shop ('space') or the Frequency Store ('platform') may list New. An individual maker ('profile')
 * may list Used only. PURE.
 */
export function canListNew(ownerKind: OwnerKind): boolean {
  return ownerKind === 'space' || ownerKind === 'platform'
}
