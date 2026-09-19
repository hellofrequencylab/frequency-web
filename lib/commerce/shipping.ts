// Physical-goods shipping (LIVE-346, ADR-1417).
//
// PURE. The commerce checkout used to persist `input.shipping ?? {}` and never ask Stripe, so a
// physical sale could settle with an empty address and fail only when a carrier was handed nothing.
// There is no in-app address form on the buy path (`startCheckoutAction` never passes `shipping`).
// Stripe Checkout is the validator: `shipping_address_collection` on the session, then the
// collected details written onto the order when it settles.
//
// Intangible kinds stay on-page. The shared CheckoutForm has no Address Element, so a physical
// cart forces hosted checkout (the only place a buyer can type an address today). That is a
// loud, named degrade, not a silent redirect.

/** Kinds that never leave a warehouse. A Journey, a download, a booking, a ticket. */
const INTANGIBLE_KINDS = new Set(['digital', 'service', 'booking', 'ticket', 'journey'])

/**
 * Countries Stripe Checkout will offer on a physical cart.
 *
 * Stripe requires an explicit ISO-3166 alpha-2 list (there is no "all"). The set is the
 * destinations this marketplace can realistically ship to: US/CA/MX, the UK and Ireland, the
 * EU-27 plus the rest of the EEA, CH, AU/NZ, and a short Asia-Pacific list. Adding a code is
 * a one-line change; do not import the cookie-consent list (that answers a different question).
 */
export const SHIP_TO_COUNTRIES: readonly string[] = [
  'US',
  'CA',
  'MX',
  'GB',
  'IE',
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'IS',
  'LI',
  'NO',
  'CH',
  'AU',
  'NZ',
  'JP',
  'SG',
  'KR',
  'HK',
]

/** True when any line in the cart is a physical good (or an unknown/legacy kind, which defaults
 *  to something that ships). PURE. */
export function cartNeedsShipping(kinds: Array<string | null | undefined>): boolean {
  return kinds.some((k) => !k || !INTANGIBLE_KINDS.has(k))
}

/**
 * The address Stripe collected on a Checkout Session, or null.
 *
 * Newer API versions put it on `collected_information.shipping_details`; older ones use
 * `shipping_details` or `shipping`. The stripe package ships no types, so this reads all three
 * and never throws. PURE.
 */
export function shippingDetailsFromSession(session: {
  shipping_details?: unknown
  shipping?: unknown
  collected_information?: { shipping_details?: unknown } | null
}): Record<string, unknown> | null {
  const raw =
    session.shipping_details ??
    session.collected_information?.shipping_details ??
    session.shipping ??
    null
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as Record<string, unknown>
}
