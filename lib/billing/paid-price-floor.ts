// THE $3 FLOOR ON A PAID TICKET OR PRODUCT (owner ruling 2026-11-19, ADR-1978 follow-up).
//
// Daniel picked "Yes, $3 minimum" on the pricing card: a new paid ticket or product charges at least
// $3. Under $3 most of the sale is the card fee (30c + 2.9%), and from the pass-through date that fee
// is the seller's, so a $1 ticket would pay its seller about 67c. Free stays free (0 is always
// allowed), and tips and donations keep their own $1 minimum (lib/billing/tips-core.ts,
// lib/billing/space-donation-checkout.ts): this floor is for what a seller SELLS, not what a supporter gives.
//
// NEW PRICES ONLY. A ticket or product already priced under $3 keeps selling at that price; the floor
// applies when a price is set or changed. That is what `previousCents` is for: a write that leaves the
// stored price where it was is never refused.
//
// The same number as the paid membership floor (lib/billing/membership-tier-price.ts), on purpose: one
// smallest real price across everything a Space sells.
//
// PURE, so the floor is one number with one test and every writer asks the same question.

import { MIN_PAID_TIER_PRICE_CENTS } from './membership-tier-price'

/** The least a paid ticket or product may charge, in cents ($3). */
export const PAID_PRICE_MIN_CENTS = MIN_PAID_TIER_PRICE_CENTS

/**
 * May a seller set this price? Free (0) or at least $3, or unchanged from what is stored. A null
 * price (no price of its own, such as a variant that takes its product's) is always allowed. PURE.
 */
export function isAllowedSellingPrice(
  cents: number | null | undefined,
  previousCents?: number | null,
): boolean {
  if (cents == null) return true
  if (!Number.isFinite(cents)) return false
  const c = Math.round(cents)
  if (c < 0) return false
  if (c === 0 || c >= PAID_PRICE_MIN_CENTS) return true
  return previousCents != null && Number.isFinite(previousCents) && Math.round(previousCents) === c
}

/** The seller's sentence for a price under the floor. Plain, says the number (docs/CONTENT-VOICE.md). */
export function paidPriceFloorSentence(what: 'ticket' | 'item' = 'item'): string {
  const dollars = (PAID_PRICE_MIN_CENTS / 100).toFixed(2).replace(/\.00$/, '')
  return what === 'ticket'
    ? `A paid ticket starts at $${dollars}. Set it to free, or to $${dollars} or more.`
    : `A paid item starts at $${dollars}. Set it to $${dollars} or more.`
}

/** The refusal sentence, or null when the price is fine. */
export function sellingPriceError(
  cents: number | null | undefined,
  what: 'ticket' | 'item' = 'item',
  previousCents?: number | null,
): string | null {
  return isAllowedSellingPrice(cents, previousCents) ? null : paidPriceFloorSentence(what)
}
