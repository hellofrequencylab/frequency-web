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
// Optional second signing secret (LIVE-215): STRIPE_CONNECT_WEBHOOK_SECRET, the whsec_ of a
// destination scoped "Events from: Connected accounts", which is the only one that receives
// a connected host's account.updated.
// Optional inline-price amount (cents) when no price id is set:
//   STRIPE_MEMBERSHIP_AMOUNT (Crew, default 1000)
//
// Crew is the ONLY sellable member tier (ADR-878). STRIPE_PRICE_SUPPORTER / STRIPE_SUPPORTER_AMOUNT are
// no longer read anywhere: setting them in the env buys a Supporter checkout exactly nothing.
// 2026-09-05 (scan2 L3-04): the same is now true of STRIPE_PRICE_CREW and STRIPE_MEMBERSHIP_AMOUNT.
// The header above still lists them; they were read only by priceFor() and membershipAmount(),
// and neither had a caller outside its own test. Checkout mints a pay-what-you-want price from the
// amount the member chose (lib/billing/checkout.ts), so a catalog price id was never consulted.
// Both helpers are deleted and both keys are gone from .env.example. STRIPE_PRICE_CREW is NOT
// required to go live; STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and NEXT_PUBLIC_APP_URL are.

import Stripe from 'stripe'
import type { EntitlementTier } from '@/lib/core/entitlement'

const SECRET = process.env.STRIPE_SECRET_KEY

/**
 * The Stripe API version this repository is written against, pinned explicitly.
 *
 * 🔴 WHY PINNING MATTERS, and why the usual reasoning about it is wrong here. An unpinned
 * `new Stripe(SECRET)` does NOT fall back to the account's dashboard default. stripe-node picks
 * `props.apiVersion || DEFAULT_API_VERSION` (node_modules/stripe/cjs/stripe.core.js) and
 * DEFAULT_API_VERSION is a constant baked into the installed package
 * (node_modules/stripe/cjs/apiVersion.js). So before this line, the contract for every money call
 * in this repo was a property of whatever `stripe` version pnpm last resolved — a dependency bump
 * could silently move it with no code change and no review.
 *
 * That is the failure class docs/DEPLOY-SAFETY.md exists for: a change nobody made, arriving
 * through a gate nobody watched. Pinning turns an implicit, floating contract into a declared one
 * that moves only when someone edits this line.
 *
 * ⚠️ It is pinned to the SDK's own baked-in version rather than an older one on purpose: matching
 * what the installed package already sends makes this a no-op TODAY and a guard TOMORROW. Changing
 * it is a deliberate migration, and `stripe-api-version.test.ts` fails when the two drift apart so
 * the choice is re-made rather than inherited.
 *
 * ⚠️ TypeScript cannot help here. The installed `stripe` package ships NO type declarations at all
 * (no `types` field, no .d.ts), so `Stripe.*` resolves to `any` throughout this repo — proven by a
 * probe whose control error was reported while a deliberately bogus `ui_mode` value was not. A
 * wrong version string or a misspelled param is a RUNTIME error here, never a compile error, which
 * is the other reason this is pinned and tested rather than merely passed.
 */
export const STRIPE_API_VERSION = '2026-08-26.dahlia'

/** The Stripe client, or null when billing isn't configured. */
export const stripe = SECRET
  ? new Stripe(SECRET, { apiVersion: STRIPE_API_VERSION as never })
  : null

// The webhook route guards `if (!stripe || STRIPE_WEBHOOK_SECRETS.length === 0)` before use.
// Warn at module load (not throw) so a misconfigured env doesn't crash unrelated pages.
if (SECRET && !process.env.STRIPE_WEBHOOK_SECRET) {
  console.warn('[stripe] STRIPE_WEBHOOK_SECRET is not set — webhook endpoint will return 503')
}
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? ''

/** The signing secret of a SECOND Stripe destination, scoped "Events from: Connected accounts".
 *  Optional. Every money path here is a destination charge, so nine of the ten subscribed events
 *  fire on the PLATFORM account and reach the first destination. `account.updated` is the
 *  exception: a connected host's capability changes fire on the CONNECTED account, and only a
 *  Connect-scoped destination receives them. Each destination has its own `whsec_`, so the route
 *  needs both (LIVE-215). */
export const STRIPE_CONNECT_WEBHOOK_SECRET = process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? ''

/** Every configured webhook signing secret, platform first, Connect second, blanks dropped. The
 *  webhook route tries each in order and accepts the first that verifies; an empty list is the
 *  "billing not configured" 503. */
export const STRIPE_WEBHOOK_SECRETS: string[] = [STRIPE_WEBHOOK_SECRET, STRIPE_CONNECT_WEBHOOK_SECRET]
  .map((s) => s.trim())
  .filter((s) => s.length > 0)

/** Billing is live as soon as a Stripe key is present (the connector sets it). A price
 *  id is optional — checkout falls back to an inline price. */
export function billingEnabled(): boolean {
  return !!stripe
}

/** Whether the configured key is LIVE mode (`sk_live_` / `rk_live_`), false for a test key, null
 *  when billing is off. Read off the key itself: Stripe does not put the mode on the account object,
 *  and a price minted in one mode does not exist in the other (HYG-049, ADR-1227). */
export function keyLivemode(): boolean | null {
  if (!SECRET) return null
  return /^(?:sk|rk)_live_/.test(SECRET)
}

let accountIdPromise: Promise<string | null> | null = null

/** The Stripe account (`acct_…`) the configured key belongs to, or null when billing is off or the
 *  lookup fails. Memoised for the process: the answer cannot change without a new key, and the
 *  checkout path asks on every resolve. A null is "cannot tell" — the resolver compares livemode
 *  alone in that case and never treats an unknown account as foreign (HYG-049, ADR-1227). */
export function stripeAccountId(): Promise<string | null> {
  if (!stripe) return Promise.resolve(null)
  if (!accountIdPromise) {
    const client = stripe
    // `retrieveCurrent`: the account the key itself belongs to (SDK v22; `retrieve(null)` is the
    // older spelling of the same call).
    accountIdPromise = client.accounts
      .retrieveCurrent()
      .then((a) => a.id ?? null)
      .catch(() => {
        accountIdPromise = null // a transient failure is not a verdict; ask again next time
        return null
      })
  }
  return accountIdPromise
}

/** The tier a Stripe price id maps back to (for the webhook). Always Crew: Crew is the only member
 *  subscription that is sold (ADR-878), and a legacy Supporter subscription is access-preserved as Crew
 *  — the same direction the retired read-time fold took, kept HERE because a Stripe price id is an
 *  external value the union cannot constrain. */
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
