// SPACE PLAN CHECKOUT (Pricing P2, ADR-363; collapsed ADR-552). A subscription Checkout for a Space
// OWNER to buy a plan (business / nonprofit). The customer is the space owner; the resolved
// Stripe Price comes from pricing_stripe_prices (the synced public price for the plan+period). The
// webhook reconciles the subscription back to setSpacePlan(space_id, plan) once it is active.
//
// GATED: returns null (a no-op) unless billingLive() AND the per-plan `*_enabled` switch is on — so
// nothing charges and no Stripe session is created while billing is OFF (the P1 invariant holds).
// Server-only. Mirrors the existing member checkout (lib/billing/checkout.ts) shape.

import { stripe, appUrl } from './stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { billingLive, getPricingValues, loadPricingFlags } from '@/lib/pricing/settings'
import { asAddonKey, type AddonKey, type SpacePlan } from '@/lib/pricing/plans'
import { resolveStripePriceId } from './pricing-prices'
import {
  asCatalogItemKey,
  asSpacePlanKey,
  catalogPriceKey,
  offersPeriod,
  priceKey,
  type BillingInterval,
  type BillingPeriod,
  type CatalogItemKey,
  type SpacePlanKey,
} from './pricing-keys'
import { itemKeyForCatalogKey, readLockedPriceId } from './space-subscription-items'

/** The per-plan enable flag for a space plan (must be ON, with billing live, to sell it). */
const PLAN_FLAG: Record<SpacePlanKey, 'plan_business_enabled' | 'plan_nonprofit_enabled'> = {
  business: 'plan_business_enabled',
  nonprofit: 'plan_nonprofit_enabled',
}

/** Is this plan sellable right now? billingLive() AND the per-plan switch. GATED. */
export async function spacePlanSellable(plan: SpacePlan | string): Promise<boolean> {
  const key = asSpacePlanKey(plan)
  if (!key) return false
  if (!(await billingLive())) return false
  const flags = await loadPricingFlags()
  return flags[PLAN_FLAG[key]] === true
}

// ADR-552: the two paid tiers (business/nonprofit) map 1:1 onto their per-plan switches. Always GATED on
// billingLive(), so this is FALSE while billing is OFF (no live loadout checkout today).
const LOADOUT_FLAG: Record<'business' | 'nonprofit', 'plan_business_enabled' | 'plan_nonprofit_enabled'> = {
  business: 'plan_business_enabled',
  nonprofit: 'plan_nonprofit_enabled',
}

/** Is a tier (business/nonprofit) sellable right now? billingLive() AND its mapped per-plan switch.
 *  GATED, FAIL-SAFE FALSE. The loadout checkout gates on this. */
export async function spaceLoadoutSellable(plan: 'business' | 'nonprofit'): Promise<boolean> {
  try {
    if (!(await billingLive())) return false
    const flags = await loadPricingFlags()
    return flags[LOADOUT_FLAG[plan]] === true
  } catch {
    return false
  }
}

/** Create a subscription Checkout session for a Space owner to buy a plan; returns the URL, or null
 *  when the plan isn't sellable / not synced / the space has no owner. GATED on spacePlanSellable.
 *  authz-delegated: caller-trusted operator/owner action authorizes the space; this binds the customer
 *  to the resolved space OWNER and stamps the space_id in metadata so the webhook reconciles correctly. */
export async function createSpacePlanCheckout(
  spaceId: string,
  plan: SpacePlan | string,
  billingPeriod: BillingPeriod = 'monthly',
): Promise<string | null> {
  if (!stripe) return null
  const planKey = asSpacePlanKey(plan)
  if (!planKey) return null
  if (!offersPeriod(planKey, billingPeriod)) return null // both business + nonprofit offer monthly + annual
  if (!(await spacePlanSellable(planKey))) return null

  // Resolve the synced public Price for this plan+period.
  const priceId = await resolveStripePriceId(priceKey(planKey, billingPeriod))
  if (!priceId) return null // not synced to Stripe yet → no-op (never an inline-price fallback for plans)

  // The customer is the Space owner; reuse their Stripe customer id if the space already has one.
  const db = createAdminClient()
  const { data: space } = (await db
    .from('spaces')
    .select('id, owner_profile_id, slug, stripe_customer_id')
    .eq('id', spaceId)
    .maybeSingle()) as {
    data: { id?: string; owner_profile_id?: string | null; slug?: string | null; stripe_customer_id?: string | null } | null
  }
  if (!space?.id || !space.owner_profile_id) return null

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

  const metadata = { kind: 'space_plan', space_id: spaceId, plan: planKey, billing_period: billingPeriod }
  // Free trial on Space plans (card upfront; days are operator-editable via pricing settings, default 14).
  // Stripe starts the subscription in `trialing`, which the reconciler treats as active
  // (lib/billing/space-subscriptions.ts), so the plan is granted during the trial and auto-converts when
  // it ends. Members have no trial (their checkout never reads this).
  const trialDays = (await getPricingValues()).trial.days
  const subscriptionData: { metadata: typeof metadata; trial_period_days?: number } =
    trialDays > 0 ? { metadata, trial_period_days: trialDays } : { metadata }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    ...(customer ? { customer } : { customer_email: ownerEmail }),
    client_reference_id: spaceId,
    metadata,
    subscription_data: subscriptionData,
    success_url: `${appUrl()}/spaces/${space.slug ?? spaceId}/settings/billing?plan=upgraded&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/spaces/${space.slug ?? spaceId}/settings/billing`,
    allow_promotion_codes: true,
  })
  return session.url
}

// ── PHASE B: the MULTI-ITEM loadout checkout (ADR-460, docs/PRICING-LADDER-PLAN.md §4/§5) ──────────
// A Space owner buys Pro as ONE subscription with MULTIPLE items: the Pro base plus one price item per
// active add-on, with quantity items for Team + Nonprofit seats. Monthly or yearly is chosen by the
// caller. The FOUNDING price is charged (the grandfathered rate); if the Space already holds a locked
// price id for an item (a prior founding subscribe that has not lapsed), THAT id is re-billed instead,
// so a founding subscriber keeps their rate on a change. A 14-day per-item trial applies.
//
// GATED on billingLive() (the master switch). Returns null (a clean no-op) while OFF, so nothing
// charges and no Stripe session is created. Server-only.

/** The loadout the caller selects: the base tier, the active add-ons, and the seat counts. Monthly or
 *  yearly via `interval`. */
export interface SpaceLoadout {
  /** The base tier the loadout is for. 'business' = the Business base (full depth); 'nonprofit' = the
   *  per-seat item. The AI add-on layers on any paid tier. 'free' is not a checkout. */
  plan: 'business' | 'nonprofit'
  /** The active metered add-ons (only AI now, ADR-552). Ignored for nonprofit framing. */
  addons?: readonly (AddonKey | string)[]
  /** Licensed seat count for seat items (Nonprofit seat quantity; tier-level Team seats, Phase D). Min 1. */
  seatQuantity?: number
  interval: BillingInterval
}

/** Resolve the Stripe price id to CHARGE for a catalog item: the Space's locked (grandfathered)
 *  founding price if it holds one for this item, else the synced FOUNDING price for the interval. Null
 *  when not synced (the item is skipped rather than charged at the wrong price). */
async function resolveLoadoutPriceId(
  spaceId: string,
  catalogKey: CatalogItemKey,
  interval: BillingInterval,
): Promise<string | null> {
  const itemKey = itemKeyForCatalogKey(catalogKey)
  if (itemKey) {
    const locked = await readLockedPriceId(spaceId, itemKey)
    if (locked) return locked // re-bill the grandfathered founding price (the lock)
  }
  // The founding price is the plain catalog key (the one charged); the list anchor is the _list variant.
  return resolveStripePriceId(catalogPriceKey(catalogKey, interval, false))
}

/** The catalog item keys + their seat-ness a loadout maps to. PURE (ADR-552). Business -> business_base
 *  plus one item per active metered add-on (only AI now); Nonprofit -> the per-seat item. The Business
 *  base is the full depth; the AI add-on layers on top. */
function catalogKeysForLoadout(loadout: SpaceLoadout): { key: CatalogItemKey; perSeat: boolean }[] {
  if (loadout.plan === 'nonprofit') return [{ key: 'nonprofit_seat', perSeat: true }]
  const out: { key: CatalogItemKey; perSeat: boolean }[] = [{ key: 'business_base', perSeat: false }]
  const addons = [...new Set((loadout.addons ?? []).map((a) => asAddonKey(typeof a === 'string' ? a : null)).filter((a): a is AddonKey => a !== null))]
  for (const addon of addons) {
    const catalogKey = asCatalogItemKey(`addon_${addon}`)
    if (!catalogKey) continue
    out.push({ key: catalogKey, perSeat: false }) // the AI add-on is not per-seat
  }
  return out
}

/** Create a single multi-item subscription Checkout for a Space owner's loadout (Pro base + add-ons,
 *  or the nonprofit seat / organization item), monthly or yearly. Charges the FOUNDING price (or the
 *  Space's grandfathered locked price when it holds one), with a 14-day per-item trial and proration.
 *  Returns the session URL, or null when the loadout is not sellable / not synced / the space has no
 *  owner. GATED on spacePlanSellable for the base plan.
 *  authz-delegated: caller-trusted operator/owner action authorizes the space; this binds the customer
 *  to the resolved space OWNER and stamps the space_id + plan in metadata so the webhook reconciles. */
export async function createSpaceLoadoutCheckout(
  spaceId: string,
  loadout: SpaceLoadout,
): Promise<string | null> {
  if (!stripe) return null
  const interval: BillingInterval = loadout.interval === 'year' ? 'year' : 'month'
  // The base plan must be sellable (billingLive + the mapped per-plan switch). GATED, FALSE while OFF.
  if (!(await spaceLoadoutSellable(loadout.plan))) return null

  // The customer is the Space owner; reuse their Stripe customer id if the space already has one.
  const db = createAdminClient()
  const { data: space } = (await db
    .from('spaces')
    .select('id, owner_profile_id, slug, stripe_customer_id, seat_quantity')
    .eq('id', spaceId)
    .maybeSingle()) as {
    data: {
      id?: string
      owner_profile_id?: string | null
      slug?: string | null
      stripe_customer_id?: string | null
      seat_quantity?: number | null
    } | null
  }
  if (!space?.id || !space.owner_profile_id) return null

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

  // PHASE D: the seat-quantity items (Team add-on / Nonprofit seat) bill the LICENSED seat count. The
  // caller may pass an explicit count (the picker's chosen seats); when it does not, fall back to the
  // Space's stored licensed count (spaces.seat_quantity), so a renewal / change bills the count the
  // Space holds. Floors to 1 (a seat item always bills at least one seat).
  const storedSeats =
    typeof space.seat_quantity === 'number' && Number.isFinite(space.seat_quantity)
      ? Math.max(0, Math.floor(space.seat_quantity))
      : 0
  const seatQuantity = Math.max(1, Math.floor(loadout.seatQuantity ?? storedSeats ?? 1))
  // Build one line item per catalog item, charging the founding (or locked) price. Seat items carry the
  // chosen quantity. An item with no synced price is skipped (never charged at the wrong price).
  const lineItems: { price: string; quantity: number }[] = []
  for (const { key, perSeat } of catalogKeysForLoadout(loadout)) {
    const priceId = await resolveLoadoutPriceId(spaceId, key, interval)
    if (!priceId) {
      // The base item failing to resolve is fatal (no plan to sell); a missing add-on price just drops
      // that add-on from the loadout rather than blocking the whole checkout.
      if (key === 'business_base' || key === 'nonprofit_seat') return null
      continue
    }
    lineItems.push({ price: priceId, quantity: perSeat ? seatQuantity : 1 })
  }
  if (lineItems.length === 0) return null

  const plan = loadout.plan
  const metadata = { kind: 'space_plan', space_id: spaceId, plan, billing_interval: interval }
  // 14-day per-item trial (operator-editable via pricing settings, default 14). Stripe starts the
  // subscription in `trialing`, which the reconciler treats as active, so the plan is granted during the
  // trial and auto-converts when it ends. Proration is Stripe's default for a multi-item subscription.
  const trialDays = (await getPricingValues()).trial.days
  const subscriptionData: { metadata: typeof metadata; trial_period_days?: number; proration_behavior?: 'create_prorations' } =
    trialDays > 0
      ? { metadata, trial_period_days: trialDays, proration_behavior: 'create_prorations' }
      : { metadata, proration_behavior: 'create_prorations' }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: lineItems,
    ...(customer ? { customer } : { customer_email: ownerEmail }),
    client_reference_id: spaceId,
    metadata,
    subscription_data: subscriptionData,
    success_url: `${appUrl()}/spaces/${space.slug ?? spaceId}/settings/billing?plan=upgraded&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/spaces/${space.slug ?? spaceId}/settings/billing`,
    allow_promotion_codes: true,
  })
  return session.url
}
