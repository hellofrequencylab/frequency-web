// HOUSEHOLD / CIRCLE BUNDLE CHECKOUT (ADR-370, REMAINING-WORK #6). A subscription Checkout for a member
// to buy the multi-seat bundle. The buyer becomes the bundle OWNER (payer); the seats themselves
// (profiles.household_bundle_id + the granted tier) are written by the webhook seating branch,
// lib/billing/bundle-seats.ts, once the subscription is active — exactly like the space-plan /
// space-membership reconcilers.
//
// 🔴 THIS FILE AND lib/billing/bundle-seats.ts SHIP TOGETHER, ALWAYS. A checkout with no seating branch
// takes real money and seats nobody. If either half is ever removed, remove both.
//
// GATED: returns null (a no-op) unless bundleSellable() (billingLive() AND bundle_household_enabled) —
// so nothing charges and no Stripe session is created while billing is OFF (the ABSOLUTE INVARIANT
// holds). Server-only. Mirrors lib/billing/space-plan-checkout.ts.
//
// THE TERMS ARE STAMPED, NOT LOOKED UP LATER. The seat count and the granted tier ride the session and
// subscription metadata, so the webhook seats what the buyer actually paid for even if an operator
// edits the bundle config the next day. Same reason the Space path stamps its plan.

import { stripe, appUrl } from './stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { bundleSellable, getHouseholdBundle } from '@/lib/pricing/settings'
import { householdBundlePriceKey } from '@/lib/pricing/bundle'
import { resolveStripePriceId } from './pricing-prices'
import { BUNDLE_KIND, BUNDLE_SEAT_IDS_KEY, bundleRoster } from './bundle-seats'
import type { BillingPeriod } from './pricing-keys'

/** Stripe caps a metadata VALUE at 500 characters. A uuid plus its separator is 37, so this ceiling is
 *  reached at 13 co-seats — far beyond any household — but it is enforced rather than trusted, because
 *  the failure mode is a truncated roster: money taken for seats the webhook can never read back. */
const METADATA_VALUE_MAX = 500

/** Create a subscription Checkout session for a member to buy the Household / Circle bundle; returns
 *  the URL, or null when the bundle isn't sellable / not synced to Stripe / the requested seats don't
 *  fit. GATED on bundleSellable.
 *
 *  `seatProfileIds` are the OTHER members this bundle seats (the buyer is always seated and never needs
 *  to be listed). They are stamped into the metadata so the webhook seats exactly them; passing none is
 *  valid and seats the buyer alone, leaving the rest of the bundle's seats open.
 *
 *  DEFAULT-DENY on the seat list: an id that is not a real profile, or one seat too many for the bundle
 *  the operator configured, refuses the whole checkout rather than quietly charging for a seat that
 *  would never be filled.
 *
 *  authz-delegated: a caller-trusted member action authorizes the buyer; this binds the customer to
 *  THIS profile and stamps the bundle metadata so the webhook seats the bundle correctly. */
export async function createBundleCheckout(opts: {
  profileId: string
  email?: string | null
  period?: BillingPeriod
  seatProfileIds?: readonly string[]
}): Promise<string | null> {
  if (!stripe) return null
  const period: BillingPeriod = opts.period ?? 'monthly'
  if (!(await bundleSellable())) return null

  // Resolve the synced Price for the bundle at this period (no inline fallback — a bundle must be synced).
  const priceId = await resolveStripePriceId(householdBundlePriceKey(period))
  if (!priceId) return null

  const config = await getHouseholdBundle()
  const requested = (opts.seatProfileIds ?? []).filter((id) => id && id !== opts.profileId)
  // The buyer occupies a seat, so the co-seats have to fit in what is left.
  if (requested.length + 1 > config.seats) return null

  const db = createAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', opts.profileId)
    .maybeSingle()
  const customer = (profile as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? undefined

  // Every co-seat must be a real profile before any money moves: the seating RPC drops ids it cannot
  // find, so an unchecked typo here becomes a bundle that silently seats fewer people than it charged for.
  let seatIds: string[] = []
  if (requested.length > 0) {
    const { data: seatRows, error } = await db.from('profiles').select('id').in('id', requested as string[])
    if (error) return null
    const found = new Set((seatRows ?? []).map((r) => (r as { id: string }).id))
    if (requested.some((id) => !found.has(id))) return null
    seatIds = bundleRoster(opts.profileId, requested, config.seats).slice(1)
  }
  const seatList = seatIds.join(',')
  if (seatList.length > METADATA_VALUE_MAX) return null

  const metadata: Record<string, string> = {
    kind: BUNDLE_KIND,
    owner_id: opts.profileId,
    billing_period: period,
    // The TERMS this bundle was bought on. The webhook prefers these over the live config.
    bundle_seats: String(config.seats),
    bundle_tier: config.tier,
    ...(seatList ? { [BUNDLE_SEAT_IDS_KEY]: seatList } : {}),
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    ...(customer ? { customer } : { customer_email: opts.email ?? undefined }),
    client_reference_id: opts.profileId,
    metadata,
    // The SUBSCRIPTION carries the same metadata, because seating runs off the subscription events
    // (created / updated / deleted), never off the session.
    subscription_data: { metadata },
    success_url: `${appUrl()}/settings/billing?bundle=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/upgrade`,
    allow_promotion_codes: true,
  })
  return session.url
}
