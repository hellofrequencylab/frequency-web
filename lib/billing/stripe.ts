// Stripe membership billing (P2.2). ENV-GATED: the whole layer stays dormant until the
// owner provides keys + price IDs — `billingEnabled()` is false and the app keeps the
// beta free toggle. The moment the env is set (test or live), checkout + the webhook go
// live with zero code changes. Server-only.
//
// Required env to go live:
//   STRIPE_SECRET_KEY      — sk_test_… (sandbox) or sk_live_…
//   STRIPE_WEBHOOK_SECRET  — whsec_… (from the webhook endpoint)
//   STRIPE_PRICE_CREW      — price_… for the paid membership (the "Crew" tier)
//   STRIPE_PRICE_SUPPORTER — price_… for the Supporter tier (optional)
//   NEXT_PUBLIC_APP_URL    — the public origin for success/cancel redirects

import Stripe from 'stripe'
import type { EntitlementTier } from '@/lib/core/entitlement'

const SECRET = process.env.STRIPE_SECRET_KEY

/** The Stripe client, or null when billing isn't configured. */
export const stripe = SECRET ? new Stripe(SECRET) : null

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? ''

/** Explicit price id for a paid tier, if the owner configured one. Optional — when
 *  absent, checkout builds an inline price (see createMembershipCheckout). */
export function priceFor(tier: EntitlementTier): string | null {
  if (tier === 'crew') return process.env.STRIPE_PRICE_CREW ?? null
  if (tier === 'supporter') return process.env.STRIPE_PRICE_SUPPORTER ?? null
  return null
}

/** Billing is live as soon as a Stripe key is present (the connector sets it). A price
 *  id is optional — checkout falls back to an inline price. */
export function billingEnabled(): boolean {
  return !!stripe
}

/** Monthly membership amount in cents for the inline-price fallback (default $10). */
export function membershipAmount(): number {
  const n = Number(process.env.STRIPE_MEMBERSHIP_AMOUNT)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 1000
}

/** The tier a Stripe price id maps back to (for the webhook). */
export function tierForPrice(priceId: string | null | undefined): EntitlementTier {
  if (priceId && priceId === process.env.STRIPE_PRICE_SUPPORTER) return 'supporter'
  return 'crew'
}

export function appUrl(): string {
  // Prefer an explicit URL; on Vercel fall back to the current deploy (so preview
  // deploys send checkout back to themselves), else the production default.
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://frequencylocal.com'
}
