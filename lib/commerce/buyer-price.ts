// Buyer-side price logic (Pricing Options P2). PURE, client-safe (no IO, no React), so it lives with
// the other commerce data shapes and is unit-tested in ./buyer-price.test.ts. These helpers back the
// reusable buyer controls (components/commerce/price-input.tsx + package-picker.tsx): what to pre-fill
// a Choose-your-price box to, whether a buyer's chosen amount clears the floor, and how a Good / Better
// / Best set orders + highlights. See docs/PRICING-OPTIONS-STRATEGY.md.
//
// MONEY STAYS OFF. These are DISPLAY + validation only; nothing here charges. The server stays the
// authority for any real amount, gated behind payoutsLive() + canTakePayments at the checkout seam.

import { formatPriceCents, MAX_PACKAGE_OPTIONS, type OfferingOption, type Price } from './types'

/** The amount (integer cents) to pre-fill a buyer's Choose-your-price box with: the suggested anchor
 *  first (the single biggest lever in PWYW), then the floor, then the lowest quick-pick chip. `fixed`
 *  pre-fills its own amount; `free` is zero; `contact` has no amount. PURE. */
export function initialChosenCents(price: Price): number | undefined {
  switch (price.mode) {
    case 'fixed':
      return price.amountCents
    case 'free':
      return 0
    case 'contact':
      return undefined
    case 'choose':
      return price.suggestedCents ?? price.minCents ?? price.pickAmountsCents?.[0]
  }
}

/** Validate the amount a BUYER chose against a Price (the client mirror of the server's authoritative
 *  check). Returns a plain, voice-compliant message, or null when the amount is usable. `free` /
 *  `contact` never fail (no amount to name). A `choose` amount must be above zero and clear the floor;
 *  the message uses gift framing for a donation. No em / en dashes. PURE. */
export function validateChosenAmount(price: Price, cents: number | undefined): string | null {
  switch (price.mode) {
    case 'free':
    case 'contact':
      return null
    case 'fixed':
      return price.amountCents && price.amountCents > 0 ? null : 'This offer has no price set yet.'
    case 'choose': {
      if (cents == null || cents <= 0) return 'Enter an amount.'
      const floor = price.minCents ?? 0
      if (cents < floor) {
        return price.donation
          ? `The smallest gift is ${formatPriceCents(floor)}.`
          : `The least you can pay is ${formatPriceCents(floor)}.`
      }
      return null
    }
  }
}

/** A sort key (integer cents) for ordering package options low to high. `free` sorts first; `contact`
 *  (no amount) sorts last so an enquiry-only option never anchors the set. PURE. */
export function priceSortValue(price: Price): number {
  switch (price.mode) {
    case 'free':
      return 0
    case 'fixed':
      return price.amountCents ?? 0
    case 'choose':
      return price.suggestedCents ?? price.minCents ?? 0
    case 'contact':
      return Number.MAX_SAFE_INTEGER
  }
}

/** The ordered, capped, highlighted view of a package set for the buyer picker. Orders low to high so
 *  the priciest option anchors perception downward, caps at MAX_PACKAGE_OPTIONS (the research sweet
 *  spot is 3, never more than 4), and resolves exactly ONE highlighted option: an explicit
 *  `recommended` flag wins, otherwise the middle option is marked "Most popular" (Good / Better / Best).
 *  `recommendedIndex` is -1 only for an empty set. PURE. */
export function orderedPackageOptions(options: OfferingOption[]): {
  options: OfferingOption[]
  recommendedIndex: number
} {
  const sorted = [...options]
    .sort((a, b) => priceSortValue(a.price) - priceSortValue(b.price))
    .slice(0, MAX_PACKAGE_OPTIONS)

  if (sorted.length === 0) return { options: [], recommendedIndex: -1 }

  const flagged = sorted.findIndex((o) => o.recommended === true)
  const recommendedIndex = flagged >= 0 ? flagged : Math.floor((sorted.length - 1) / 2)

  return {
    options: sorted.map((o, i) => ({ ...o, recommended: i === recommendedIndex })),
    recommendedIndex,
  }
}
