// CARD PROCESSING, PASSED THROUGH TO THE SELLER (owner ruling 2026-11-18).
//
// Every seller checkout is a Stripe DESTINATION CHARGE, and on that charge type Stripe debits its
// processing fee from the PLATFORM balance, never from the connected account ("Your platform pays the
// Stripe fee after the application_fee_amount is transferred to your account",
// docs.stripe.com/connect/destination-charges). The public promise has always read "0% on your own
// people, plus card processing", but the application fee carried only Frequency's own percentage, so
// Frequency paid the card fee on every sale and lost money on every 0% one.
//
// This module is the ONE place the card fee is priced. A checkout adds it to the application fee, so
// the seller bears it, and stores it in its own column so it is never mistaken for Frequency's fee:
// `platform_fee_cents` stays "what Frequency earned" and `take_rate_bps` still reconciles with it.
//
// PURE: no I/O, no env read. The rollout switch lives with the callers.
//
// WHAT IT IS NOT: Stripe's exact cost. An international card, a currency conversion or a wallet with
// its own pricing costs more than the standard domestic rate, and Stripe only reports the real fee
// after the charge settles. This is the published standard rate, the same one a seller would pay
// anywhere else, charged the same way every time so a receipt can state it before the card is run.

/** Stripe's standard domestic card rate, in basis points (2.9%). */
export const CARD_PROCESSING_BPS = 290

/** Stripe's standard fixed amount per successful charge, in minor units (30 cents). */
export const CARD_PROCESSING_FIXED_CENTS = 30

/** The card processing fee (minor units) on a gross charge: 2.9% rounded to the nearest cent, plus
 *  the fixed 30. Zero for a charge that is not a positive finite amount. Never more than the charge. */
export function cardProcessingCents(grossCents: number): number {
  if (!Number.isFinite(grossCents) || grossCents <= 0) return 0
  const gross = Math.floor(grossCents)
  const fee = Math.round((gross * CARD_PROCESSING_BPS) / 10000) + CARD_PROCESSING_FIXED_CENTS
  return Math.min(gross, fee)
}

/** The three figures every seller checkout needs, kept apart so no caller can blur them. */
export interface SellerFeeBreakdown {
  /** Frequency's own fee: what the ledger books as revenue and a receipt calls Frequency's fee. */
  platformFeeCents: number
  /** The card processing passed through to the seller. Not Frequency revenue. */
  processingFeeCents: number
  /** What Stripe is told to keep back from the seller: the two above, added. */
  applicationFeeCents: number
}

/**
 * Split a seller charge into Frequency's fee, the card fee, and the application fee Stripe collects.
 *
 * The application fee can never exceed the charge (Stripe rejects it), so on a very small sale the
 * card fee yields first: Frequency's fee is kept whole up to the charge, and the card fee takes
 * what is left. `passThrough: false` is the pre-ruling behavior, where the application fee is
 * Frequency's fee alone, so a caller behind a rollout switch has one code path.
 */
export function sellerFeeBreakdown(
  grossCents: number,
  platformFeeCents: number,
  opts: { passThrough: boolean } = { passThrough: true },
): SellerFeeBreakdown {
  if (!Number.isFinite(grossCents) || grossCents <= 0) {
    return { platformFeeCents: 0, processingFeeCents: 0, applicationFeeCents: 0 }
  }
  const gross = Math.floor(grossCents)
  const platform = Math.min(gross, Math.max(0, Number.isFinite(platformFeeCents) ? Math.floor(platformFeeCents) : 0))
  const processing = opts.passThrough ? Math.min(gross - platform, cardProcessingCents(gross)) : 0
  return { platformFeeCents: platform, processingFeeCents: processing, applicationFeeCents: platform + processing }
}

/** What the seller receives from a charge after both fees. Never negative. */
export function sellerNetCents(grossCents: number, breakdown: SellerFeeBreakdown): number {
  if (!Number.isFinite(grossCents) || grossCents <= 0) return 0
  return Math.max(0, Math.floor(grossCents) - breakdown.applicationFeeCents)
}

/** The card fee as the percent Stripe's `application_fee_percent` takes (two decimals), for a
 *  subscription, where a fixed amount cannot be expressed. Rounded UP to the next hundredth so the
 *  30 cents is never under-collected on a small recurring price. */
export function applicationFeePercent(amountCents: number, breakdown: SellerFeeBreakdown): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0 || breakdown.applicationFeeCents <= 0) return 0
  const pct = (breakdown.applicationFeeCents / Math.floor(amountCents)) * 100
  return Math.min(100, Math.ceil(pct * 100 - 1e-9) / 100)
}
