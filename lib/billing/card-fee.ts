// WHEN THE CARD FEE PASSES THROUGH (owner ruling 2026-11-18; math in ./processing-fee.ts).
//
// `CARD_FEE_PASS_THROUGH_FROM` is an EFFECTIVE DATE, not an on/off flag, and that is deliberate.
// A sale made before the date paid no card fee and a sale made on or after it did, so with one
// timestamp every later reader (a sale email, an earnings view, a refund) can state what a past
// sale actually carried from two facts it already has: the amount and when the sale was made.
// No money table needs a new column for it, which matters because a migration here would hold
// every other open PR behind the readiness gate (docs/DATABASE.md, HYG-217).
//
// Blank, or anything that is not a full ISO timestamp with a zone, = off: every checkout prices exactly as it did before the ruling. Set it to
// an ISO timestamp (for example 2027-02-01T08:00:00Z) to turn the pass-through on from that
// instant. THE DATE IS SET ONCE. Moving it after sales have been made on the new terms would make
// those sales read as if they carried a different fee than the one Stripe collected. The gate to
// set it is in docs/RUNBOOKS.md ("Card fee pass-through").
//
// Reads process.env at call time, never at import, so a test can set the variable and call again.

import { envStringOrNull } from '@/lib/env/string'
import { cardProcessingCents, sellerFeeBreakdown, type SellerFeeBreakdown } from './processing-fee'

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

/** The instant the pass-through starts, or null when it is off (unset, blank, or not a date). */
export function cardFeePassThroughFrom(): Date | null {
  const raw = envStringOrNull('CARD_FEE_PASS_THROUGH_FROM')
  // A FULL timestamp with a zone, nothing looser. `Date.parse('1')` is the year 2001, so a value
  // typed as if this were an on/off flag would otherwise switch the fee on for every sale ever
  // made; a bare date would start it at a different instant depending on the server's zone.
  if (!raw || !ISO_INSTANT.test(raw)) return null
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? new Date(ms) : null
}

function asDate(at: Date | string | number | null | undefined): Date | null {
  if (at == null) return null
  const d = at instanceof Date ? at : new Date(at)
  return Number.isFinite(d.getTime()) ? d : null
}

/** Did (or does) a sale made at `at` carry the card fee? `at` defaults to now, the checkout case.
 *  An unreadable `at` is "no": a figure is never invented for a sale whose time is unknown. */
export function cardFeePassesThrough(at: Date | string | number | null = new Date()): boolean {
  const from = cardFeePassThroughFrom()
  const when = asDate(at)
  return !!from && !!when && when.getTime() >= from.getTime()
}

/** The card fee (minor units) a sale of `grossCents` made at `at` carried: the standard rate when
 *  the pass-through was on at that instant, else 0. */
export function cardFeeCentsAt(grossCents: number, at: Date | string | number | null = new Date()): number {
  return cardFeePassesThrough(at) ? cardProcessingCents(grossCents) : 0
}

/** The fee figures for a seller checkout starting now: Frequency's fee, the card fee, and their sum,
 *  which is what goes to Stripe as the application fee. With the pass-through off this is the old
 *  shape, where the application fee is Frequency's fee alone. */
export function sellerFeesNow(grossCents: number, platformFeeCents: number): SellerFeeBreakdown {
  return sellerFeeBreakdown(grossCents, platformFeeCents, { passThrough: cardFeePassesThrough() })
}

/** The same figures for a sale already made, from its amount, its stored platform fee and its time. */
export function sellerFeesAt(
  grossCents: number,
  platformFeeCents: number,
  at: Date | string | number | null,
): SellerFeeBreakdown {
  return sellerFeeBreakdown(grossCents, platformFeeCents, { passThrough: cardFeePassesThrough(at) })
}
