import type Stripe from 'stripe'

// THE PAYMENT-METHOD HALF OF A COMMERCE CHECKOUT SESSION (LIVE-396 instalments).
//
// ── WHAT IT IS TODAY, MEASURED ───────────────────────────────────────────────────────────────────
// lib/commerce/checkout.ts sets NEITHER `payment_method_types` NOR `payment_method_configuration`,
// so every commerce session inherits the Stripe Dashboard's DEFAULT configuration. That is a real
// property and mostly a good one — a method the owner enables reaches checkout with no deploy —
// but it has one sharp edge that LIVE-396 walked into.
//
// ── THE SHARP EDGE ───────────────────────────────────────────────────────────────────────────────
// Instalments (Klarna, Affirm) are the other half of LIVE-396, and the fastest way to get them is
// to switch them on in the Dashboard. Because commerce inherits the default, that ALSO turns them
// on for every other thing commerce sells: physical goods, services and booking deposits. A
// pay-later method is right for a $444 Journey and is a different proposition on a $20 item.
//
// lib/billing/tickets.ts already reasoned this out for its own channel and narrowed deliberately
// (a delayed-notification method cannot share a product with a 30-minute seat hold). This is the
// same seam for commerce, built the same way, so the two channels cannot drift apart in HOW they
// are scoped even though they scope to different sets.
//
// ── 🔴 THE DEFAULT IS "CHANGE NOTHING" ───────────────────────────────────────────────────────────
// With no env set this returns `{}` and the session is created exactly as it is today, inheriting
// the Dashboard. That matters: this seam must not become a second, quieter way to lose a payment
// method. It only ever does something when the owner has deliberately named a configuration.
//
// ── HOW THE OWNER TURNS INSTALMENTS ON FOR JOURNEYS ONLY ─────────────────────────────────────────
//   1. Stripe Dashboard → Settings → Payments → Payment methods → Create a configuration named
//      e.g. "Journeys (instalments)", with card and Link on AND Klarna / Affirm on.
//   2. Copy its id (pmc_…) into STRIPE_JOURNEY_PAYMENT_METHOD_CONFIGURATION.
//   3. Redeploy. A cart that is entirely Journeys now offers instalments; nothing else changes.
// The domain half is already done — frequencylocal.com is a registered payment method domain
// (OWN-076), which Klarna requires just as the wallets do.
//
// ⚠️ WHICH CONFIGURATION STRIPE ACTUALLY READS. checkout.ts creates DESTINATION charges with
// `on_behalf_of`, so the CONNECTED ACCOUNT is the settlement merchant and its configuration governs
// what a buyer sees on a host's sale. A platform-scoped configuration id will not rescue a method
// that is off on the connected-account side. Both were confirmed to exist on 2026-09-21
// (pmc_1TdurnPhyalyRPP1vrYEJTv2 platform, pmc_1TlJUqPhyalyRPP1I1Gxr5SJ connected).
//
// PURE and total: reads env, returns a param object. No Stripe call, no I/O.

/** The configuration used when a cart is entirely Journeys — where instalments belong. */
export const JOURNEY_PMC_ENV = 'STRIPE_JOURNEY_PAYMENT_METHOD_CONFIGURATION'

/** The configuration used for every other commerce cart. Unset = inherit the Dashboard default. */
export const COMMERCE_PMC_ENV = 'STRIPE_COMMERCE_PAYMENT_METHOD_CONFIGURATION'

/**
 * The payment-method params for a commerce Checkout Session, or `{}` to inherit the Dashboard.
 *
 * `journeyOnly` is deliberately ALL-or-nothing rather than "contains a Journey": a mixed cart is
 * not a Journey purchase, and offering instalments on it because one line qualifies would let a
 * buyer finance a t-shirt by adding a course. Commerce already refuses to mix sellers, so a mixed
 * cart is rare and this costs nothing real.
 *
 * The two Stripe parameters are MUTUALLY EXCLUSIVE (passing both is a request error), which is why
 * this returns one object and never merges.
 */
export function commercePaymentMethodParams(opts: {
  journeyOnly: boolean
  /**
   * Only the two ids below are ever read, so this is deliberately NOT `NodeJS.ProcessEnv`:
   * that type requires NODE_ENV and would force every caller and test to supply fields this
   * function does not look at. A narrow shape says what is actually depended on.
   */
  env?: Record<string, string | undefined>
}): { payment_method_configuration?: string } {
  const env = opts.env ?? process.env
  const journey = (env[JOURNEY_PMC_ENV] ?? '').trim()
  if (opts.journeyOnly && journey) return { payment_method_configuration: journey }

  const commerce = (env[COMMERCE_PMC_ENV] ?? '').trim()
  if (commerce) return { payment_method_configuration: commerce }

  // Inherit the Dashboard. This is today's behaviour and stays the default forever.
  return {}
}

/** Narrow re-export so checkout.ts can spread the result without widening its Stripe import. */
export type CommercePaymentMethodParams = Pick<
  Stripe.Checkout.SessionCreateParams,
  'payment_method_configuration'
>
