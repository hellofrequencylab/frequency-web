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
import { billingLive, getPricingValues, loadPricingFlags, type PricingFlagKey } from '@/lib/pricing/settings'
import { asAddonKey, type AddonKey, type SpacePlan } from '@/lib/pricing/plans'
import { resolveStripePriceId } from './pricing-prices'
import {
  asCatalogItemKey,
  asSpacePlanKey,
  catalogPriceKey,
  offersPeriod,
  type BillingInterval,
  type BillingPeriod,
  type CatalogItemKey,
  type SpacePlanKey,
} from './pricing-keys'
import { itemKeyForCatalogKey, readLockedPriceId } from './space-subscription-items'
import { isBetaPricingActive, loadoutChargeArm, loadoutChargePriceKey } from '@/lib/pricing/beta'
import { spaceHasBetaPriceGrant } from './space-beta-grant'
import { profileAccountEmail } from '@/lib/profiles/account-email'

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

// ADR-811: the paid loadout tiers map 1:1 onto their per-plan switches. Always GATED on billingLive(),
// so this is FALSE while billing is OFF. Business/Collective/Independent buy the depth ladder; Nonprofit
// is the flat per-mission plan. Collective + Independent bill via their own catalog bases (ADR-811).
type LoadoutPlan = 'business' | 'collective' | 'nonprofit' | 'independent'
const LOADOUT_FLAG: Record<LoadoutPlan, PricingFlagKey> = {
  business: 'plan_business_enabled',
  collective: 'plan_collective_enabled',
  nonprofit: 'plan_nonprofit_enabled',
  independent: 'plan_independent_enabled',
}

/** Is a loadout tier (business/collective/nonprofit/independent) sellable right now? billingLive() AND
 *  its mapped per-plan switch. GATED, FAIL-SAFE FALSE. The loadout checkout gates on this. */
export async function spaceLoadoutSellable(plan: LoadoutPlan): Promise<boolean> {
  try {
    if (!(await billingLive())) return false
    const flags = await loadPricingFlags()
    return flags[LOADOUT_FLAG[plan]] === true
  } catch {
    return false
  }
}

/** Whether OPERATOR SEATS can actually be bought right now (A4/A5): billingLive() AND the seat is
 *  activated (`catalog_operator_seat_active`, ADR-803) AND its founding price is synced to Stripe. Until
 *  all three hold, `operator_seat` is an inert placeholder the loadout checkout skips (isCatalogItemInert
 *  Placeholder / a null price), so the seat picker stays hidden rather than offering a silent no-op.
 *  GATED, FAIL-SAFE FALSE. */
export async function operatorSeatsSellable(): Promise<boolean> {
  try {
    if (!(await billingLive())) return false
    const flags = await loadPricingFlags()
    if (flags.catalog_operator_seat_active !== true) return false
    const priceId = await resolveStripePriceId(catalogPriceKey('operator_seat', 'month', false))
    return !!priceId
  } catch {
    return false
  }
}

/** Open the Stripe billing portal for a Space's subscription so the OWNER can MANAGE it: update the
 *  payment method, switch or cancel the plan, and adjust seats where the portal is configured to allow it.
 *  Returns the hosted portal URL, or null when the Space has no Stripe customer yet (never went through
 *  checkout) or Stripe is not configured. The portal is Stripe-hosted, so there is NO custom subscription
 *  mutation here (Stripe owns proration + the payment UI); managing an existing subscription is allowed
 *  even if `billing_live` is later toggled off, so a customer can always cancel. authz-delegated: the
 *  caller (the owner-gated action) authorizes the Space. */
export async function createSpaceBillingPortal(spaceId: string): Promise<string | null> {
  if (!stripe) return null
  const { data: space } = (await createAdminClient()
    .from('spaces')
    .select('slug, stripe_customer_id')
    .eq('id', spaceId)
    .maybeSingle()) as { data: { slug?: string | null; stripe_customer_id?: string | null } | null }
  if (!space?.stripe_customer_id) return null // no customer => nothing to manage (never transacted)
  const session = await stripe.billingPortal.sessions.create({
    customer: space.stripe_customer_id,
    return_url: `${appUrl()}/spaces/${space.slug ?? spaceId}/settings/billing`,
  })
  return session.url
}

/**
 * Create a subscription Checkout session for a Space owner to buy a plan; returns the URL, or null when
 * the plan isn't sellable / not synced / the space has no owner.
 *
 * ONE PLAN, ONE PRICE (ADR-880). This used to be its OWN checkout, billing the legacy
 * `<plan>_<period>` product that syncPricingProductsToStripe mints from `pricing_settings.plan.*`. That
 * map carries the BETA amount ($19 business monthly), and it has no cutover: after 2026-09-01 the
 * loadout checkout would charge $29 for Business while this path still charged $19 forever. Two live
 * prices for one plan is not a pricing policy, it is a bug with a URL.
 *
 * So this is now a thin ADAPTER over createSpaceLoadoutCheckout: the same catalog item, the same beta
 * auto-revert, the same grandfathered locked price for an existing founding subscriber, the same
 * metadata the webhook reconciles. The legacy `<plan>_<period>` Stripe prices stay synced and resolvable
 * (a grandfathered subscription still renews on its own price id); nothing NEW is ever sold at them.
 *
 * authz-delegated: caller-trusted operator/owner action authorizes the space; the delegate binds the
 * customer to the resolved space OWNER and stamps the space_id in metadata so the webhook reconciles.
 */
export async function createSpacePlanCheckout(
  spaceId: string,
  plan: SpacePlan | string,
  billingPeriod: BillingPeriod = 'monthly',
): Promise<string | null> {
  const planKey = asSpacePlanKey(plan)
  if (!planKey) return null
  if (!offersPeriod(planKey, billingPeriod)) return null // both business + nonprofit offer monthly + annual
  // The legacy axis is monthly|annual; the catalog axis is month|year. One translation, here.
  const interval: BillingInterval = billingPeriod === 'annual' ? 'year' : 'month'
  return createSpaceLoadoutCheckout(spaceId, { plan: planKey, interval })
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
  /** The base tier the loadout is for. 'business' = the run-your-practice base; 'collective' = the
   *  network-depth base (automations, team, collaborators); 'independent' = the standalone white-label
   *  base (off-network); 'nonprofit' = the flat per-mission item. The AI add-on layers on any paid tier.
   *  'free' is not a checkout. */
  plan: LoadoutPlan
  /** The active metered add-ons (only AI now, ADR-552). Ignored for nonprofit framing. */
  addons?: readonly (AddonKey | string)[]
  /** Licensed seat count for seat items (Nonprofit seat quantity; tier-level Team seats, Phase D). Min 1. */
  seatQuantity?: number
  interval: BillingInterval
}

/** Resolve the Stripe price id to CHARGE for a catalog item, on the three-armed rule in
 *  `loadoutChargeArm` (lib/pricing/beta.ts, the pure decision):
 *
 *    1. LOCK     — the Space holds a grandfathered `locked_price_id` for this item: re-bill it.
 *    2. FOUNDING — no lock, and either the beta WINDOW is open or this Space carries the private
 *                  per-Space GRANT (`spaces.beta_price_grant`, ADR-1061). Charge the founding key.
 *    3. LIST     — everything else. The default since the window closed (ADR-1060).
 *
 *  BETA AUTO-REVERT (ADR-811) + THE PRIVATE GRANT (ADR-1061): both variants of every price are minted
 *  active by the catalog sync, so arms 2 and 3 are a pure key switch with no re-sync and no new Stripe
 *  object — the $49 a granted Space pays is the same price id the window charged everyone.
 *
 *  🔴 THE GRANT IS SPENT BY THE FIRST CHECKOUT. Once this Space subscribes, the reconciler records the
 *  charged price id as its lock, arm 1 wins from then on, and the grant is never consulted again. That
 *  is why the grant needs no expiry date and why revoking it later cannot raise anyone's rate.
 *
 *  `hasBetaGrant` is resolved ONCE per checkout by the caller and threaded in, rather than re-read per
 *  item: it is one fact about the Space, and reading it in here would issue a query per line item.
 *
 *  Null when the key is not synced (the item is skipped rather than charged at the wrong price). */
async function resolveLoadoutPriceId(
  spaceId: string,
  catalogKey: CatalogItemKey,
  interval: BillingInterval,
  hasBetaGrant: boolean,
): Promise<string | null> {
  const itemKey = itemKeyForCatalogKey(catalogKey)
  const locked = itemKey ? await readLockedPriceId(spaceId, itemKey) : null
  const arm = loadoutChargeArm({
    lockedPriceId: locked,
    betaActive: isBetaPricingActive(),
    spaceHasBetaGrant: hasBetaGrant,
  })
  // The lock is a concrete price id, not a catalog key, so it returns straight out.
  if (arm === 'lock') return locked
  return resolveStripePriceId(loadoutChargePriceKey(catalogKey, interval, arm))
}

/** The catalog item keys + their seat-ness a loadout maps to. PURE (ADR-552). Business -> business_base
 *  plus one item per active metered add-on (only AI now); Nonprofit -> the single flat nonprofit item.
 *  The Business base is the full depth; the AI add-on layers on top. NOTHING here is per-seat: Nonprofit
 *  is a FLAT $29/mo (ADR-590), not a per-seat charge, so it bills quantity 1 like the Business base. The
 *  `nonprofit_seat` catalog key is a legacy name (the item is flat); see pricing-catalog.test.ts. */
function catalogKeysForLoadout(loadout: SpaceLoadout): { key: CatalogItemKey; perSeat: boolean }[] {
  // OPERATOR SEATS (ADR-799): a per-seat add-on available on ANY paid plan. Included only when the owner
  // buys extra operator seats (seatQuantity > 0); the checkout sets this item's quantity to the seat
  // count. The owner's own seat is the free base allowance, so this bills only the ADDITIONAL operators.
  const wantsSeats = Math.floor(loadout.seatQuantity ?? 0) > 0
  const operatorSeat: { key: CatalogItemKey; perSeat: boolean }[] = wantsSeats
    ? [{ key: 'operator_seat', perSeat: true }]
    : []
  if (loadout.plan === 'nonprofit') return [{ key: 'nonprofit_seat', perSeat: false }, ...operatorSeat]
  // Independent is a flat standalone white-label base, OFF the network — no metered add-ons layer on it.
  if (loadout.plan === 'independent') return [{ key: 'independent_base', perSeat: false }, ...operatorSeat]
  // Business + Collective share the depth ladder: a flat base plus the optional AI add-on (and seats).
  const base: CatalogItemKey = loadout.plan === 'collective' ? 'collective_base' : 'business_base'
  const out: { key: CatalogItemKey; perSeat: boolean }[] = [{ key: base, perSeat: false }]
  const addons = [...new Set((loadout.addons ?? []).map((a) => asAddonKey(typeof a === 'string' ? a : null)).filter((a): a is AddonKey => a !== null))]
  for (const addon of addons) {
    const catalogKey = asCatalogItemKey(`addon_${addon}`)
    if (!catalogKey) continue
    out.push({ key: catalogKey, perSeat: false }) // the AI add-on is not per-seat
  }
  return [...out, ...operatorSeat]
}

/** Create a single multi-item subscription Checkout for a Space owner's loadout (Business base + add-ons,
 *  or the flat nonprofit item), monthly or yearly. Charges the FOUNDING price (or the
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
    // `email` is NOT a profiles column. Selecting it failed the whole PostgREST request (42703),
    // so `owner` came back null and BOTH values below stayed undefined — the owner's saved
    // stripe_customer_id was never reused (duplicate Stripe customers on every repeat checkout)
    // and the session was created with no customer_email to prefill.
    const { data: owner } = await db
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', space.owner_profile_id)
      .maybeSingle()
    customer = (owner as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? undefined
    ownerEmail = (await profileAccountEmail(space.owner_profile_id)) ?? undefined
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
  // THE PRIVATE BETA PRICE GRANT (ADR-1061), read ONCE for the whole loadout. Its own request, not a
  // column on the select above: `spaces.beta_price_grant` ships in a proposal migration the owner
  // applies by hand, and adding an undeployed column to that select would fail the WHOLE PostgREST
  // request with 42703 and take every checkout down — the exact bug the `profiles.email` comment above
  // records. FAIL-SAFE FALSE: unreadable means charge list, never under-charge.
  const hasBetaGrant = await spaceHasBetaPriceGrant(spaceId)
  // Build one line item per catalog item, charging the locked / founding / list price per
  // `resolveLoadoutPriceId`. Seat items carry the chosen quantity. An item with no synced price is
  // skipped (never charged at the wrong price).
  const lineItems: { price: string; quantity: number }[] = []
  for (const { key, perSeat } of catalogKeysForLoadout(loadout)) {
    const priceId = await resolveLoadoutPriceId(spaceId, key, interval, hasBetaGrant)
    if (!priceId) {
      // The base item failing to resolve is fatal (no plan to sell); a missing add-on price just drops
      // that add-on from the loadout rather than blocking the whole checkout.
      if (key === 'business_base' || key === 'collective_base' || key === 'independent_base' || key === 'nonprofit_seat') return null
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
