// The selling role/permission gate (Phase 0, Etsy-Grade Market). These pure predicates are the
// SINGLE source of truth for who may take in-app payments and who may list a New product, so the
// rule is trivial to widen later. No IO — keep it importable from both client and server.

import type { OwnerKind } from './types'

/**
 * R2 — may this owner KIND take IN-APP PAYMENTS (open a Stripe Checkout)?
 *
 * A Space Shop ('space') and the Frequency Store ('platform') may. An individual ('profile') may
 * NOT: personal selling is off on every personal tier (ADR-1709, LIVE-753, superseding the
 * 2026-09-08 ruling `OWN-046`). A personal Market listing stays up as an inquiry, and the buyer
 * messages the seller; the money a person receives is tips, open at 0% on every tier. Selling is
 * what a Business Space is for.
 *
 * 🔴 THIS IS THE OWNER-KIND HALF ONLY. A 'space' seller still has to clear the payments gate on its
 * PLAN (space_payments at Business, lib/pricing/payments-gate.ts), which lib/commerce/checkout.ts
 * asks per seller. Kept as a pure predicate because the checkout path and the product render
 * (app/(public)/market/[id]/page.tsx) both read it.
 *
 * ⚠️ Two independent guards still sit behind it: `payoutsLive()` (lib/billing/connect.ts), the
 * master switch, and Connect readiness per seller in lib/commerce/checkout.ts.
 *
 * 📌 `canListNew` below is a SEPARATE ruling: an individual lists Used only.
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
