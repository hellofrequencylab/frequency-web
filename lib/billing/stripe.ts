// Stripe membership billing (P2.2). ENV-GATED: the whole layer stays dormant until the
// owner provides keys + price IDs — `billingEnabled()` is false and the app keeps the
// beta free toggle. The moment the env is set (test or live), checkout + the webhook go
// live with zero code changes. Server-only.
//
// Required env to go live:
//   STRIPE_SECRET_KEY      — sk_test_… (sandbox) or sk_live_…
//   STRIPE_WEBHOOK_SECRET  — whsec_… (from the webhook endpoint)
//   STRIPE_PRICE_CREW      — price_… for the paid membership (the "Crew" tier)
//   NEXT_PUBLIC_APP_URL    — the public origin for success/cancel redirects
// Optional inline-price amount (cents) when no price id is set:
//   STRIPE_MEMBERSHIP_AMOUNT (Crew, default 1000)
//
// Crew is the ONLY sellable member tier (ADR-878). STRIPE_PRICE_SUPPORTER / STRIPE_SUPPORTER_AMOUNT are
// no longer read anywhere: setting them in the env buys a Supporter checkout exactly nothing.

import Stripe from 'stripe'
import type { EntitlementTier } from '@/lib/core/entitlement'

const SECRET = process.env.STRIPE_SECRET_KEY

/** The Stripe client, or null when billing isn't configured. */
export const stripe = SECRET ? new Stripe(SECRET) : null

// The webhook route guards `if (!stripe || !STRIPE_WEBHOOK_SECRET)` before use.
// Warn at module load (not throw) so a misconfigured env doesn't crash unrelated pages.
if (SECRET && !process.env.STRIPE_WEBHOOK_SECRET) {
  console.warn('[stripe] STRIPE_WEBHOOK_SECRET is not set — webhook endpoint will return 503')
}
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? ''

/** Explicit price id for a paid tier, if the owner configured one. Optional — when
 *  absent, checkout builds an inline price (see createMembershipCheckout).
 *
 *  Crew is the only sellable member tier (ADR-878), so every other label resolves to null and cannot
 *  start a purchase. A historical `supporter` row reads null here, never a $12 price. */
export function priceFor(tier: EntitlementTier): string | null {
  if (tier === 'crew') return process.env.STRIPE_PRICE_CREW ?? null
  return null
}

/** Billing is live as soon as a Stripe key is present (the connector sets it). A price
 *  id is optional — checkout falls back to an inline price. */
export function billingEnabled(): boolean {
  return !!stripe
}

/** Monthly amount in cents for the Crew inline-price fallback (default $10), overridable via
 *  STRIPE_MEMBERSHIP_AMOUNT. There is one sellable member tier, so there is one amount (ADR-878). */
export function membershipAmount(): number {
  const n = Number(process.env.STRIPE_MEMBERSHIP_AMOUNT)
  if (Number.isFinite(n) && n > 0) return Math.round(n)
  return 1000
}

/** The tier a Stripe price id maps back to (for the webhook). Always Crew: Crew is the only member
 *  subscription that is sold (ADR-878), and a legacy Supporter subscription is access-preserved as Crew
 *  exactly like the read-time `supporter -> crew` mapping in lib/core/entitlement.ts (ADR-458). */
export function tierForPrice(_priceId?: string | null): EntitlementTier {
  return 'crew'
}

export function appUrl(): string {
  // On a Vercel PREVIEW deploy, always use the deploy's own URL so checkout returns to
  // the preview being tested — even when NEXT_PUBLIC_APP_URL points at production.
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://frequencylocal.com'
}
