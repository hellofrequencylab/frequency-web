// FOUNDING BUSINESS CHECKOUT — the LIVE, gated checkout seam for a Space to become a Founding
// Business (the per-city fee-buydown cohort, ADR-599/803). It creates a Stripe SUBSCRIPTION Checkout
// for the Space owner at the locked founding Business rate ($49/mo or $490/yr, read from
// getFoundingConfig — never hardcoded), stamped so the EXISTING space-plan webhook reconciles the
// Space to Business; the durable, grandfathered founder record (locked rate + 3% take-rate for life)
// is written on the success confirm via the reused grantFoundingStatus() hook (lib/founding/status.ts).
//
// THE ABSOLUTE INVARIANT (ADR-362): INERT until billingLive(). While billing is OFF this returns a
// clean { ok:false, state:'not_open' } BEFORE any Stripe call — no session, no charge, no card. The
// gate lives here, in the seam, not only in the page, so even a live render cannot charge until the
// owner flips billing_live.
//
// THE DOUBLE-SUBSCRIBE GUARD: a Space that ALREADY has a live paid subscription (spaceIsPaying) cannot
// buy again — the checkout returns { state:'already_active' } instead of creating a second subscription.
//
// THE PER-CITY CAP: the founding Business cohort is capped per city (config.business_city_cap). The
// spots remaining are computed over foundingBusinessTakenInCity (lib/founding/status.ts) + the pure
// foundingBusinessSpotsRemaining (lib/pricing/founding.ts). No spots left -> { state:'sold_out' }.
//
// Server-only. The PURE decision helpers (state machine + annual math) are exported for unit tests
// without Stripe/Supabase; the IO wrappers apply them.

import { stripe, appUrl } from '@/lib/billing/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveStripePriceId } from '@/lib/billing/pricing-prices'
import { priceKey, offersPeriod, type BillingPeriod } from '@/lib/billing/pricing-keys'
import { asSpacePlan } from '@/lib/pricing/plans'
import { billingLive, getFoundingConfig, getPricingValues } from '@/lib/pricing/settings'
import { foundingBusinessSpotsRemaining } from '@/lib/pricing/founding'
import { foundingBusinessTakenInCity, getFoundingStatus } from '@/lib/founding/status'

// ── PURE: the annual math (annual is "two months free", read from annual_discount.months_free) ──

/** The founding Business ANNUAL price in cents, derived from the monthly rate and the operator-set
 *  months-free (annual = monthly * (12 - months_free); the default 2 gives $490 under $49/mo). PURE.
 *  Never hardcodes the annual amount — it is always the monthly rate minus the free months. */
export function foundingBusinessAnnualCents(monthlyCents: number, monthsFree: number): number {
  const m = Math.max(0, Math.floor(monthlyCents))
  const free = Math.min(12, Math.max(0, Math.floor(monthsFree)))
  return m * (12 - free)
}

/** How much a year of the founding Business rate SAVES vs paying monthly (the "two months free"
 *  amount = monthly * months_free). PURE. */
export function foundingBusinessAnnualSavingsCents(monthlyCents: number, monthsFree: number): number {
  const m = Math.max(0, Math.floor(monthlyCents))
  const free = Math.min(12, Math.max(0, Math.floor(monthsFree)))
  return m * free
}

// ── PURE: the checkout state machine (the guard) ──────────────────────────────────────────────

/** The four states the founding Business checkout can be in for a Space. `open` is the only one that
 *  can create a Stripe session. */
export type FoundingBusinessCheckoutState = 'not_open' | 'already_active' | 'sold_out' | 'open'

/** Resolve the checkout state from the three gates, in PRECEDENCE order. PURE — the single place the
 *  guard logic lives, so the page render and the checkout seam can never disagree:
 *   1. `already_active` — a Space that already pays (a live Business subscription) never double-subscribes.
 *   2. `not_open`       — billing is OFF (the ADR-362 invariant): the surface is preview-only, no charge.
 *   3. `sold_out`       — no founding spots remain in the Space's city (the per-city cap is full).
 *   4. `open`           — sellable: a real founding Business checkout can start.
 *  already_active wins first so a paying Space reads correctly regardless of the flag/cap; while billing
 *  is OFF a Space is never paying, so this ordering is only defensive. */
export function foundingBusinessCheckoutState(input: {
  billingLive: boolean
  spaceIsPaying: boolean
  spotsRemaining: number
}): FoundingBusinessCheckoutState {
  if (input.spaceIsPaying) return 'already_active'
  if (!input.billingLive) return 'not_open'
  if (input.spotsRemaining <= 0) return 'sold_out'
  return 'open'
}

// ── IO: is the Space already paying? (the double-subscribe guard's input) ──────────────────────

/** Whether a Space already has a LIVE paid subscription — a paid `spaces.plan` (business/nonprofit,
 *  anything but free) OR a stored `stripe_subscription_id`. Either is proof of an active plan, so the
 *  founding checkout must not create a second subscription. FAIL-SAFE to false (a read error never
 *  fabricates a paying state; the create path re-reads this before any Stripe call). Untyped admin read
 *  (ADR-246). */
export async function spaceIsPaying(spaceId: string): Promise<boolean> {
  try {
    const { data } = (await createAdminClient()
      .from('spaces')
      .select('plan, stripe_subscription_id')
      .eq('id', spaceId)
      .maybeSingle()) as { data: { plan?: string | null; stripe_subscription_id?: string | null } | null }
    if (!data) return false
    const paidPlan = asSpacePlan(data.plan) !== 'free'
    const hasSubscription = typeof data.stripe_subscription_id === 'string' && data.stripe_subscription_id.length > 0
    return paidPlan || hasSubscription
  } catch {
    return false
  }
}

// ── IO: the resolved offer (display + gating), one read for the page and the action ────────────

/** The founding Business offer for a Space: the locked rates (from getFoundingConfig, never hardcoded),
 *  the derived annual price + savings, the per-city cap + spots remaining for the given city, the
 *  paying/billing gates, and the resolved checkout state. The page renders from this; the action
 *  re-resolves it (with the submitted city) before creating a session so the two never diverge. */
export interface FoundingBusinessOffer {
  monthlyCents: number
  annualCents: number
  annualSavingsCents: number
  monthsFree: number
  takeBps: number
  cityCap: number
  cohortCity: string | null
  spotsRemaining: number
  spaceIsPaying: boolean
  billingLive: boolean
  state: FoundingBusinessCheckoutState
}

/** Resolve the full offer for a Space. `city` scopes the per-city spots count; when absent (no city
 *  known yet) the cap is shown as fully open (spotsRemaining = cityCap), and the action re-resolves
 *  with the owner's submitted city for the authoritative check. FAIL-SAFE throughout (each read has its
 *  own fallback), so a transient error renders the preview rather than breaking the page. */
export async function resolveFoundingBusinessOffer(
  spaceId: string,
  city: string | null,
): Promise<FoundingBusinessOffer> {
  const [config, values, live, paying] = await Promise.all([
    getFoundingConfig(),
    getPricingValues(),
    billingLive(),
    spaceIsPaying(spaceId),
  ])
  const monthsFree = values.annual_discount.months_free
  const trimmedCity = (city ?? '').trim()
  const taken = trimmedCity ? await foundingBusinessTakenInCity(trimmedCity) : 0
  const spotsRemaining = trimmedCity
    ? foundingBusinessSpotsRemaining(config, taken)
    : config.business_city_cap
  return {
    monthlyCents: config.business_monthly_cents,
    annualCents: foundingBusinessAnnualCents(config.business_monthly_cents, monthsFree),
    annualSavingsCents: foundingBusinessAnnualSavingsCents(config.business_monthly_cents, monthsFree),
    monthsFree,
    takeBps: config.business_take_bps,
    cityCap: config.business_city_cap,
    cohortCity: trimmedCity || null,
    spotsRemaining,
    spaceIsPaying: paying,
    billingLive: live,
    state: foundingBusinessCheckoutState({ billingLive: live, spaceIsPaying: paying, spotsRemaining }),
  }
}

// ── IO: the checkout-session creator (GATED) ───────────────────────────────────────────────────

/** The result of starting a founding Business checkout. A non-`open` gate returns its state so the
 *  caller can render the matching message (never a broken URL). */
export type StartFoundingBusinessResult =
  | { ok: true; url: string }
  | { ok: false; state: Exclude<FoundingBusinessCheckoutState, 'open'> }
  | { ok: false; error: string }

/**
 * Create a Stripe SUBSCRIPTION Checkout for a Space to become a Founding Business at the locked
 * founding rate for the chosen period. GATED, in order:
 *   • billingLive() false / no Stripe client  -> { state:'not_open' } BEFORE any Stripe call (ADR-362).
 *   • spaceIsPaying(spaceId) true              -> { state:'already_active' } (no double-subscribe).
 *   • no spots left in `city`                  -> { state:'sold_out' }.
 * Only when `open` does it resolve the synced Business price for the period and create the session,
 * stamped metadata { kind:'space_plan', plan:'business', founding:'business', cohort_city } so the
 * EXISTING space-plan webhook reconciles the Space to Business AND the success confirm can grant the
 * durable founder record. No trial: a Founding Business locks in at checkout. authz-delegated: the
 * caller (the owner-gated action) authorizes the Space; this binds the customer to the resolved Space
 * OWNER and stamps space_id so the webhook reconciles correctly.
 */
export async function createFoundingBusinessCheckout(input: {
  spaceId: string
  slug: string
  period: BillingPeriod
  city: string
}): Promise<StartFoundingBusinessResult> {
  const { spaceId, slug, period } = input
  const city = (input.city ?? '').trim()

  // ── THE GATE. Nothing below runs while billing is OFF. No Stripe, no charge, no card. ──
  if (!stripe) return { ok: false, state: 'not_open' }
  if (!(await billingLive())) return { ok: false, state: 'not_open' }

  // Never create a second subscription for a Space that already pays.
  if (await spaceIsPaying(spaceId)) return { ok: false, state: 'already_active' }

  // The per-city cap. A city is required to place the founder in a cohort + count the cap.
  if (!city) return { ok: false, error: 'Enter the city your business operates in.' }
  const config = await getFoundingConfig()
  const taken = await foundingBusinessTakenInCity(city)
  if (foundingBusinessSpotsRemaining(config, taken) <= 0) return { ok: false, state: 'sold_out' }

  // Both periods are offered for Business; resolve the SYNCED price for the chosen one (the same
  // founding Business price the standard plan checkout charges). Not synced -> clean no-op, never an
  // inline-price fallback (mirrors createSpacePlanCheckout).
  if (!offersPeriod('business', period)) return { ok: false, error: 'That billing period is not available.' }
  const priceId = await resolveStripePriceId(priceKey('business', period))
  if (!priceId) return { ok: false, error: 'Founding checkout is not available yet.' }

  // The customer is the Space owner; reuse their Stripe customer id if the Space already has one.
  const db = createAdminClient()
  const { data: space } = (await db
    .from('spaces')
    .select('id, owner_profile_id, slug, stripe_customer_id')
    .eq('id', spaceId)
    .maybeSingle()) as {
    data: { id?: string; owner_profile_id?: string | null; slug?: string | null; stripe_customer_id?: string | null } | null
  }
  if (!space?.id || !space.owner_profile_id) return { ok: false, error: 'This space has no owner to bill.' }

  let customer = space.stripe_customer_id ?? undefined
  let ownerEmail: string | undefined
  if (!customer) {
    const { data: owner } = await db
      .from('profiles')
      .select('email, stripe_customer_id')
      .eq('id', space.owner_profile_id)
      .maybeSingle()
    const ownerRow = owner as { email?: string | null; stripe_customer_id?: string | null } | null
    customer = ownerRow?.stripe_customer_id ?? undefined
    ownerEmail = ownerRow?.email ?? undefined
  }

  // kind:'space_plan' so the existing reconciler sets the Space to Business (money path reused, no
  // webhook edit); the founding.* keys are read only by the success confirm to grant the founder record.
  const metadata = {
    kind: 'space_plan',
    space_id: spaceId,
    plan: 'business',
    billing_period: period,
    founding: 'business',
    cohort_city: city,
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      ...(customer ? { customer } : { customer_email: ownerEmail }),
      client_reference_id: spaceId,
      metadata,
      subscription_data: { metadata },
      success_url: `${appUrl()}/spaces/${space.slug ?? slug}/settings/billing/founding/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/spaces/${space.slug ?? slug}/settings/billing/founding`,
      allow_promotion_codes: true,
    })
    if (!session.url) return { ok: false, error: 'Could not start checkout. Please try again.' }
    return { ok: true, url: session.url }
  } catch (err) {
    console.error('[founding-business-checkout] failed to create session:', err)
    return { ok: false, error: 'Could not start checkout. Please try again.' }
  }
}

/** Read the cohort city already recorded on a Space's founding record (if any), so the checkout can
 *  prefill the city field for a Space that reserved earlier. FAIL-SAFE to null. */
export async function spaceCohortCity(spaceId: string): Promise<string | null> {
  const record = await getFoundingStatus({ spaceId })
  return record?.cohortCity ?? null
}
