// FEATURE → TIER LADDER + PLACEHOLDER PRICE POINTS (ADR-518 Phase G, owner directive #9). The single,
// PURE, client-safe source that answers, for one tier-gated feature: which tiers sit on its ladder, what
// each tier unlocks (a limit/quota or an on/off), and the placeholder PRICE POINT for each. It is the one
// config the reusable FeatureTierRange selector (components/pricing/feature-tier-range.tsx) reads, so no
// component ever invents a price of its own.
//
// THE MODEL (ADR-517 Phase F + owner directive #9). Every feature is AVAILABLE (Phase F made Space
// functions universal); the freemium TIER gates USAGE/LIMITS + the advanced depth. So each gated feature
// shows a range across the tiers (Free → paid) with an upgrade price point. The gate itself still lives in
// lib/pricing/gates.ts (FEATURE_GATES) + the LIVE featureAllowed seam; THIS module is the DISPLAY ladder
// that mirrors it. The feature-tiers.test.ts asserts every gated FEATURE_GATES key has a ladder here whose
// minTier equals the gate's minEntitlement, so the two never drift.
//
// PLACEHOLDER PRICING — BILLING IS ON HOLD (ADR-518). `PLACEHOLDER_PRICING` is the ONE go-live switch:
// while it is true every price below is a PREVIEW only and NOTHING charges (the selector's CTA is a link,
// never a checkout). Flip it to false when real billing goes live.
//
// THE PRICES THEMSELVES ARE NO LONGER TYPED HERE (Phase 5, ADR-915). SPACE_PLAN_PRICE_CENTS is READ off
// the code catalog the checkout bills from (lib/billing/pricing-keys.ts CATALOG), carrying the list
// anchor and the Opening Beta rate for EVERY plan, so beta-vs-list is one shape rather than a per-tier
// patch. The one number still written down here is the Crew price, which has no catalog item; the
// operator settings layer (lib/pricing/settings.ts PRICING_DEFAULTS) reads it from here rather than
// restating it.
//
// ⚠️ FEATURE_TIER_LADDERS is built ONCE at module load, so the beta-window answer baked into its rung
// prices is the one that was true when the process started. That is exact for every practical case (a
// build, a request, a cold start) and self-corrects on the next one; a caller that must be exact across
// the cutover instant should call tierPriceLabel / tierPriceCents with an explicit `betaActive`.
//
// PURE + framework-independent (no Supabase/Next/React), like lib/pricing/plans.ts, so it is trivially
// unit-testable and safe to import into a client component. Reuses the existing DISPLAY convention
// (formatCents, lib/pricing/display.ts) so prices read identically to the rest of pricing. Copy follows
// docs/CONTENT-VOICE.md: plain, honest, no em dashes, no manufactured urgency, never a dark pattern.

import { formatCents } from './display'
import { effectiveCatalogAmounts, isBetaPricingActive } from './beta'
import { SPACE_PLAN_LABEL, SPACE_PLANS, type SpacePlan } from './plans'
import { ENTITLEMENT_LABEL, ENTITLEMENT_TIERS, deriveTier, type EntitlementTier } from '@/lib/core/entitlement'
import { catalogItem, type CatalogAmounts, type CatalogItemKey } from '@/lib/billing/pricing-keys'
import type { GateAxis } from './gates'

// ── THE GO-LIVE SWITCH ────────────────────────────────────────────────────────────────────────────

/** THE placeholder-pricing switch (ADR-518, billing ON HOLD). While true, every price in this module is
 *  a PREVIEW and nothing charges: the selector shows the ladder + placeholder price points and its CTA is
 *  a plain link to the billing surface, never a checkout. Flip to false when real billing goes live (and
 *  set the real amounts in the price maps below). This is the single, obvious go-live flag. */
export const PLACEHOLDER_PRICING = true

/** The catalog item each PAID Space plan is billed from (space-plan-checkout catalogKeysForLoadout).
 *  A free Space has no item because $0 is not a Stripe price. PURE. */
const PLAN_CATALOG_ITEM: Record<Exclude<SpacePlan, 'free'>, CatalogItemKey> = {
  business: 'business_base',
  collective: 'collective_base',
  nonprofit: 'nonprofit_seat',
  independent: 'independent_base',
}

/** THE Space price map, DERIVED (Phase 5, ADR-915). One row per plan, each carrying BOTH numbers the
 *  ladder can ever need: `listCents` (the crossed-out anchor) and `foundingCents` (the Opening Beta rate
 *  actually charged today). Read straight off the code catalog the checkout bills from
 *  (lib/billing/pricing-keys.ts CATALOG), so a price is written down in exactly one place.
 *
 *  BETA-VS-LIST IS REPRESENTED ONCE, HERE. It used to be a per-tier patch: this map held only the list
 *  price, and Collective's beta rate rode alongside it in a one-off `COLLECTIVE_BETA_CENTS` constant.
 *  Business had a beta rate too and never got a constant, so every in-app ladder quoted $29 while
 *  /pricing quoted $19. A tier cannot be forgotten now: the shape carries both numbers for every plan,
 *  and a plan with no beta rate simply has the two equal. */
export const SPACE_PLAN_PRICE_CENTS: Record<SpacePlan, CatalogAmounts> = {
  free: { listCents: 0, foundingCents: 0 },
  business: catalogItem(PLAN_CATALOG_ITEM.business).month,
  collective: catalogItem(PLAN_CATALOG_ITEM.collective).month,
  nonprofit: catalogItem(PLAN_CATALOG_ITEM.nonprofit).month,
  independent: catalogItem(PLAN_CATALOG_ITEM.independent).month,
}

/** @deprecated The LIST monthly price per Space plan, in cents. Derived from SPACE_PLAN_PRICE_CENTS and
 *  kept only for the in-app plan ladder, which still reads a bare number. New callers want
 *  `spacePlanPriceCents(plan, betaActive)`, which answers what a Space is charged TODAY. */
export const PLACEHOLDER_SPACE_PRICE_CENTS: Record<SpacePlan, number> = {
  free: SPACE_PLAN_PRICE_CENTS.free.listCents,
  business: SPACE_PLAN_PRICE_CENTS.business.listCents,
  collective: SPACE_PLAN_PRICE_CENTS.collective.listCents,
  nonprofit: SPACE_PLAN_PRICE_CENTS.nonprofit.listCents,
  independent: SPACE_PLAN_PRICE_CENTS.independent.listCents,
}

/** @deprecated The Collective Opening Beta monthly price (cents), now just one cell of
 *  SPACE_PLAN_PRICE_CENTS. Kept as a named alias for the in-app plan ladder; it is no longer a
 *  Collective-only patch, and no tier needs one. */
export const COLLECTIVE_BETA_CENTS = SPACE_PLAN_PRICE_CENTS.collective.foundingCents

/** The monthly price per SELLABLE personal membership tier, in cents: Member free, Crew $9 (ADR-878).
 *  THE one place the Crew price is written down. It is not in the Stripe plan catalog (the member ladder
 *  is not sold through the plan loadout), so this pure, client-safe map is the source, and
 *  PRICING_DEFAULTS.tier.crew reads it rather than restating it.
 *
 *  Supporter has no entry (ADR-878): it is off the sellable ladder, so there is no member price for it.
 *  A historical `supporter` tier is priced through tierPriceCents, which collapses it to Crew the same
 *  way deriveTier does, so a Supporter row prices at Crew and never at $12. */
export const PLACEHOLDER_MEMBER_PRICE_CENTS: Record<Exclude<EntitlementTier, 'supporter'>, number> = {
  free: 0,
  crew: 900,
}

/** What a Space on `plan` is CHARGED per month right now, in cents: the Opening Beta rate while the beta
 *  window is open, the list price once it closes. The display twin of what the checkout resolves
 *  (lib/pricing/beta.ts effectiveCatalogAmounts, the same rule space-plan-checkout bills on), so a rung
 *  can never quote a price the checkout has stopped charging. PURE — pass `betaActive` to pin it. */
export function spacePlanPriceCents(plan: SpacePlan, betaActive: boolean = isBetaPricingActive()): number {
  return effectiveCatalogAmounts(SPACE_PLAN_PRICE_CENTS[plan] ?? SPACE_PLAN_PRICE_CENTS.free, betaActive)
    .foundingCents
}

// ── The ascending display ladders per axis (a clean upgrade path) ───────────────────────────────────
// The RANGE the selector moves across. Space uses free → business (ADR-552: free-vs-paid is a usage
// state within Business; Non Profit is a sibling verified-501c3 plan, sold separately, not a rung here).
// Personal uses free → crew: the whole member ladder (ADR-878). Supporter is not a rung and is not sold;
// the Supporter badge rides on top of Crew and unlocks nothing beyond it.

/** The Space plan rungs the range selector shows, ascending. A clean upgrade path (Non Profit is sold
 *  separately, so it is not a rung here). */
export const SPACE_LADDER_TIERS: readonly SpacePlan[] = ['free', 'business', 'collective']

/** The personal membership rungs the range selector shows, ascending. Member (free) and Crew: the whole
 *  ladder (ADR-878). */
export const MEMBER_LADDER_TIERS: readonly EntitlementTier[] = ['free', 'crew']

// ── Rank + price-label helpers (pure) ───────────────────────────────────────────────────────────────

/** The rank of a tier label on its axis (Space plan rank, else membership tier rank). Unknown → 0
 *  (lowest, default-deny), so an unrecognized tier never reads as "already unlocked". PURE. */
export function tierRankOnAxis(axis: GateAxis, tier: string): number {
  const list = axis === 'plan' ? SPACE_PLANS : ENTITLEMENT_TIERS
  const i = (list as readonly string[]).indexOf(tier)
  return i < 0 ? 0 : i
}

/** The naming-canon label for a tier on its axis (Pro / Business / Crew / ...). Unknown → the raw string
 *  title-cased fallback. PURE. */
export function tierLabelOnAxis(axis: GateAxis, tier: string): string {
  if (axis === 'plan') return SPACE_PLAN_LABEL[tier as SpacePlan] ?? tier
  return ENTITLEMENT_LABEL[tier as EntitlementTier] ?? tier
}

/** The monthly price cents a tier is CHARGED on its axis. PURE. (Exported so the sibling meter ladder,
 *  lib/pricing/feature-meters.ts, prices its rungs from the SAME map — one price source.)
 *
 *  Space plans resolve through the beta window, so a rung quotes the Opening Beta rate while it is open
 *  and the list price after the cutover, matching /pricing and the checkout. Before Phase 5 this returned
 *  the LIST price unconditionally, which is why every FeatureTierRange rung read $29 for Business while
 *  /pricing read $19. */
export function tierPriceCents(axis: GateAxis, tier: string, betaActive: boolean = isBetaPricingActive()): number {
  if (axis === 'plan') {
    return SPACE_PLAN_PRICE_CENTS[tier as SpacePlan] ? spacePlanPriceCents(tier as SpacePlan, betaActive) : 0
  }
  // deriveTier collapses a historical 'supporter' to 'crew' (ADR-458/878), so a legacy row prices at
  // Crew rather than at a $12 tier nobody can buy.
  const sellable = deriveTier(tier as EntitlementTier) as Exclude<EntitlementTier, 'supporter'>
  return PLACEHOLDER_MEMBER_PRICE_CENTS[sellable] ?? 0
}

/** A plain, honest price label for a tier on its axis, reusing the shared display format (formatCents).
 *  "Free" for the floor; "$X/mo" for a flat tier. Non Profit is FLAT, never per-seat. PURE. */
export function tierPriceLabel(axis: GateAxis, tier: string, betaActive?: boolean): string {
  const cents = tierPriceCents(axis, tier, betaActive)
  if (cents === 0) return 'Free'
  return `${formatCents(cents)}/mo`
}

// ── The per-feature raw config (axis + minTier + what each rung unlocks) ─────────────────────────────
// One entry per tier-gated FEATURE_GATES key. `unlocks` is the plain line the selector prints under each
// rung: the limit/quota or the on/off it grants for THIS feature. No em dashes; honest, no urgency.
// Where a line names a NUMBER it is a @placeholder mirror of PLACEHOLDER_METER_LIMITS
// (lib/pricing/feature-meters.ts) — THAT map is the one go-live source of quantities (ADR-837); edit it
// there and keep these lines in step. Lines with no natural quantity stay qualitative.

interface RawFeatureLadder {
  axis: GateAxis
  /** The minimum tier that unlocks the feature (must equal FEATURE_GATES[key].minEntitlement). */
  minTier: string
  /** The plain feature name the selector heads with. */
  title: string
  /** The ascending rungs, each with the plain unlock line for this feature at that tier. The tier list
   *  is a subset of the axis ladder (SPACE_LADDER_TIERS / MEMBER_LADDER_TIERS), in order. */
  rungs: { tier: string; unlocks: string }[]
}

/** Build the two Space rungs (free → the tier that UNLOCKS the feature) with per-feature copy. The unlock
 *  rung defaults to Business, but a deeper feature names its real floor (Collective for collaboration /
 *  automation / team / multi-pipeline, Independent for white-label) so the display ladder shows the rung
 *  where it actually turns on, never marking an intermediate paid rung as the unlock (ADR-552 / ADR-811). */
function spaceRungs(free: string, unlock: string, unlockTier: SpacePlan = 'business') {
  return [
    { tier: 'free', unlocks: free },
    { tier: unlockTier, unlocks: unlock },
  ]
}

const RAW_FEATURE_LADDERS: Record<string, RawFeatureLadder> = {
  // ── Space functions (plan axis; the CRM/Email/… tier seam FUNCTION_FEATURE_KEY maps to) ──────────
  space_crm: {
    axis: 'plan',
    minTier: 'business',
    title: 'CRM',
    // @placeholder 200 mirrors PLACEHOLDER_METER_LIMITS.space_crm (ADR-837, lowered by ADR-914).
    rungs: spaceRungs(
      'The pipeline with your first 200 contacts free.',
      'The full CRM with unlimited contacts: pipeline, private notes, and governed playbooks. Multiple pipelines and team roles come with Collective.',
    ),
  },
  space_email: {
    axis: 'plan',
    minTier: 'business',
    title: 'Email',
    // @placeholder 300 and 5,000 mirror PLACEHOLDER_METER_LIMITS.space_email (ADR-837).
    rungs: spaceRungs(
      'Up to 300 email sends each month.',
      'Up to 5,000 sends a month, automations, and saved templates. Collective raises it to 25,000.',
    ),
  },
  space_automation: {
    axis: 'plan',
    minTier: 'collective',
    title: 'Automations',
    // @placeholder 1,000 runs/mo mirrors PLACEHOLDER_METER_LIMITS.space_automation (ADR-837).
    rungs: spaceRungs(
      'One pipeline, no automations.',
      'Governed playbooks and multi-step sequences that run the safe, reversible moves for you, with 1,000 runs included each month.',
      'collective',
    ),
  },
  space_team: {
    axis: 'plan',
    minTier: 'collective',
    title: 'Team roles',
    // @placeholder 3 included seats mirrors PLACEHOLDER_METER_LIMITS.space_team; more seats stay the
    // ADR-799 per-seat add-on (never a wall).
    rungs: spaceRungs(
      'One operator seat.',
      'Add teammates with roles: editor, moderator, and admin. Three seats included, add more per seat.',
      'collective',
    ),
  },
  space_collaborators: {
    axis: 'plan',
    minTier: 'business',
    title: 'Collaborator hosting',
    // @placeholder 3 mirrors PLACEHOLDER_METER_LIMITS.space_collaborators (ADR-837). Collaboration opens
    // at Business as a real, small allowance and goes unlimited at Collective, so the ladder reads as
    // "use more" rather than "unlock".
    rungs: spaceRungs(
      'Be a Collaborator on other Spaces and events, and preview the hosting surface.',
      'Host up to 3 other businesses inside your space, and co-host events with Collaborator Spaces. They keep their own page and pay for their own space. Collective hosts unlimited and adds revenue splits.',
    ),
  },
  space_revenue_splits: {
    axis: 'plan',
    minTier: 'collective',
    title: 'Revenue splits with collaborators',
    rungs: spaceRungs(
      'Host collaborators and settle up between yourselves.',
      'Split the money automatically on shared events and bookings, so a collective can actually run its shared business.',
      'collective',
    ),
  },
  space_sms: {
    axis: 'plan',
    minTier: 'collective',
    title: 'Group SMS',
    rungs: spaceRungs(
      'Email and in-app notifications.',
      'Text your members about the things that cannot wait for an inbox. Sending needs your carrier registration.',
      'collective',
    ),
  },
  space_memberships: {
    axis: 'plan',
    minTier: 'business',
    title: 'Sell memberships',
    rungs: spaceRungs(
      'Sell tickets, take donations, and run your shop. Free members and followers, no limit.',
      'Sell recurring memberships with their own tiers, benefits, and member-only spaces.',
    ),
  },
  space_campaigns: {
    axis: 'plan',
    minTier: 'business',
    title: 'Campaigns and funnels',
    rungs: spaceRungs(
      'Email your people directly, inside your send allowance.',
      'Campaigns, funnels, and saved sequences that bring new people in and follow up for you.',
    ),
  },
  space_membership_tickets: {
    axis: 'plan',
    minTier: 'business',
    title: 'Membership-included event tickets',
    rungs: spaceRungs(
      'Sell tickets to everyone.',
      'Reserve event tickets for your own members, or for one membership tier, so your membership includes your events.',
    ),
  },
  space_multi_pipeline: {
    axis: 'plan',
    minTier: 'collective',
    title: 'Multiple pipelines',
    rungs: spaceRungs(
      'One pipeline for your Space.',
      'Multiple pipelines, one per segment or program.',
      'collective',
    ),
  },
  space_whitelabel: {
    axis: 'plan',
    minTier: 'independent',
    title: 'Your own brand and domain',
    rungs: spaceRungs(
      'Your accent and logo on a Frequency address.',
      'Your own custom domain and full branding, badge off.',
      'independent',
    ),
  },
  // ── Space AI depth (plan axis; the Resonance Engine paid depth · ADR-387) ────────────────────────
  space_crm_playbooks: {
    axis: 'plan',
    minTier: 'business',
    title: 'Governed playbooks',
    rungs: spaceRungs(
      'Vera suggests moves; you approve each one by hand.',
      'Governed auto-execution of the safe, reversible moves, plus advanced segments.',
    ),
  },
  space_crm_resonance: {
    axis: 'plan',
    minTier: 'business',
    title: 'Resonance view',
    rungs: spaceRungs(
      'Read-only scoring in the free wedge.',
      'The resonance view: who is close by with your vibe, and who is going quiet.',
    ),
  },
  space_crm_resonance_ai: {
    axis: 'plan',
    minTier: 'business',
    title: 'Resonance Graph',
    rungs: spaceRungs(
      'Read-only scoring in the free wedge.',
      'Predictive alerts, the full Resonance Graph, and managed matching.',
    ),
  },
  // ── Personal membership (tier axis; free < crew) ─────────────────────────────────────────────────
  vault_cash_in: {
    axis: 'tier',
    minTier: 'crew',
    title: 'Spend your Gems',
    rungs: [
      { tier: 'free', unlocks: 'Earn Gems and watch them add up.' },
      { tier: 'crew', unlocks: 'Spend your Gems and claim rewards from the Vault.' },
    ],
  },
  gamification_full: {
    axis: 'tier',
    minTier: 'crew',
    title: 'The full rewards loop',
    rungs: [
      { tier: 'free', unlocks: 'Earn Zaps and Gems as you go.' },
      { tier: 'crew', unlocks: 'The full loop: streaks, seasons, and the whole rewards ladder.' },
    ],
  },
  vera_unlimited: {
    axis: 'tier',
    minTier: 'crew',
    title: 'Vera without the daily cap',
    rungs: [
      { tier: 'free', unlocks: 'A handful of Vera messages each day.' },
      { tier: 'crew', unlocks: 'Vera without the daily cap.' },
    ],
  },
  // ── Personal leadership (tier axis). Crew is the people who run the place, so these read as what Crew
  // DOES, never as what a Member is missing. The free rung always names something real a Member can do.
  // The `event_paid_tickets` and `personal_payouts` ladders are gone with their gates (ADR-914). A
  // ladder here exists to DISPLAY a gate, and there is no longer a gate: selling and getting paid are
  // free on every tier. What differs is the rate, which the pricing grid renders from the take-rate
  // vector rather than from a per-feature ladder.
  journey_library_list: {
    axis: 'tier',
    minTier: 'crew',
    title: 'List a Journey in the library',
    rungs: [
      { tier: 'free', unlocks: 'Publish a Journey and share it by link.' },
      { tier: 'crew', unlocks: 'List your Journeys in the public library, where the whole community finds them.' },
    ],
  },
  entry_points: {
    axis: 'tier',
    minTier: 'crew',
    title: 'Entry points',
    rungs: [
      { tier: 'free', unlocks: 'Share any page with a plain link.' },
      { tier: 'crew', unlocks: 'Branded QR codes, short links, and print-ready flyers for the thing you run.' },
    ],
  },
}

// ── The built ladder (labels + placeholder prices filled in) ────────────────────────────────────────

/** One rung of a feature's tier ladder: the tier id, its canon label, its placeholder price label + cents,
 *  the plain unlock line, and whether it is the free floor. Plain data, serializable (safe to pass from a
 *  server component into the client selector). */
export interface FeatureTierStep {
  tier: string
  label: string
  /** The formatted placeholder price ("Free", "$19/mo", "from $199/mo", ...). Preview only. */
  price: string
  /** Raw placeholder cents, for any caller that computes (e.g. a savings note). */
  priceCents: number
  /** The plain line: what this tier unlocks for THIS feature (a limit/quota or an on/off). */
  unlocks: string
  /** True for the free floor rung (the freemium tier). */
  isFree: boolean
  /** True when this rung meets or clears the feature's minimum unlock tier. */
  unlocked: boolean
}

/** A feature's full tier ladder: the axis it ranks on, the minimum unlock tier, the plain feature title,
 *  and the ascending rungs with their placeholder price points. Plain data (serializable). */
export interface FeatureTierLadder {
  featureKey: string
  axis: GateAxis
  minTier: string
  title: string
  steps: FeatureTierStep[]
  /** True while prices are placeholders and nothing charges (mirrors PLACEHOLDER_PRICING). */
  placeholderPricing: boolean
}

/** Build the display ladder for a raw config entry: fill each rung's label + placeholder price + unlock,
 *  mark the free floor and whether it clears the minimum. PURE. */
function buildLadder(featureKey: string, raw: RawFeatureLadder): FeatureTierLadder {
  const minRank = tierRankOnAxis(raw.axis, raw.minTier)
  const steps: FeatureTierStep[] = raw.rungs.map((r) => ({
    tier: r.tier,
    label: tierLabelOnAxis(raw.axis, r.tier),
    price: tierPriceLabel(raw.axis, r.tier),
    priceCents: tierPriceCents(raw.axis, r.tier),
    unlocks: r.unlocks,
    isFree: tierRankOnAxis(raw.axis, r.tier) === 0,
    unlocked: tierRankOnAxis(raw.axis, r.tier) >= minRank,
  }))
  return {
    featureKey,
    axis: raw.axis,
    minTier: raw.minTier,
    title: raw.title,
    steps,
    placeholderPricing: PLACEHOLDER_PRICING,
  }
}

/** Every feature → tier ladder, keyed by feature key (built once from the raw config). */
export const FEATURE_TIER_LADDERS: Record<string, FeatureTierLadder> = Object.fromEntries(
  Object.entries(RAW_FEATURE_LADDERS).map(([key, raw]) => [key, buildLadder(key, raw)]),
)

/** Every feature key that has a tier ladder here (for iteration / coverage checks). */
export const FEATURE_TIER_KEYS: readonly string[] = Object.keys(FEATURE_TIER_LADDERS)

// ── Read helpers (pure) ─────────────────────────────────────────────────────────────────────────────

/** The tier ladder for a feature, or null when the feature has no ladder (not tier-gated). PURE. */
export function featureTierLadder(featureKey: string): FeatureTierLadder | null {
  return FEATURE_TIER_LADDERS[featureKey] ?? null
}

/** Does a tier meet a feature's minimum unlock on its axis? PURE, default-deny (unknown tier ranks 0). */
export function isFeatureUnlockedAt(ladder: FeatureTierLadder, tier: string): boolean {
  return tierRankOnAxis(ladder.axis, tier) >= tierRankOnAxis(ladder.axis, ladder.minTier)
}

/** The index of the rung that represents a viewer's CURRENT tier on a ladder: the highest rung whose rank
 *  is <= the viewer's tier rank (so a tier that sits between two rungs maps to the lower rung, and a tier
 *  above every rung maps to the top). Defaults to 0 (the free floor) when the tier is unknown / below the
 *  first rung. PURE. */
export function currentStepIndex(ladder: FeatureTierLadder, tier: string): number {
  const rank = tierRankOnAxis(ladder.axis, tier)
  let idx = 0
  for (let i = 0; i < ladder.steps.length; i++) {
    if (tierRankOnAxis(ladder.axis, ladder.steps[i]!.tier) <= rank) idx = i
  }
  return idx
}
