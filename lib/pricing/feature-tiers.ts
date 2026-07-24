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
// never a checkout). The amounts mirror the code catalog founding rates (lib/billing/pricing-keys.ts
// CATALOG); when billing goes live, swap PLACEHOLDER_SPACE_PRICE_CENTS / PLACEHOLDER_MEMBER_PRICE_CENTS
// (or point the builder at the operator catalog) and flip PLACEHOLDER_PRICING to false. That is the SINGLE
// place real numbers drop in.
//
// PURE + framework-independent (no Supabase/Next/React), like lib/pricing/plans.ts, so it is trivially
// unit-testable and safe to import into a client component. Reuses the existing DISPLAY convention
// (formatCents, lib/pricing/display.ts) so prices read identically to the rest of pricing. Copy follows
// docs/CONTENT-VOICE.md: plain, honest, no em dashes, no manufactured urgency, never a dark pattern.

import { formatCents } from './display'
import { SPACE_PLAN_LABEL, SPACE_PLANS, type SpacePlan } from './plans'
import { ENTITLEMENT_LABEL, ENTITLEMENT_TIERS, type EntitlementTier } from '@/lib/core/entitlement'
import type { GateAxis } from './gates'

// ── THE GO-LIVE SWITCH ────────────────────────────────────────────────────────────────────────────

/** THE placeholder-pricing switch (ADR-518, billing ON HOLD). While true, every price in this module is
 *  a PREVIEW and nothing charges: the selector shows the ladder + placeholder price points and its CTA is
 *  a plain link to the billing surface, never a checkout. Flip to false when real billing goes live (and
 *  set the real amounts in the price maps below). This is the single, obvious go-live flag. */
export const PLACEHOLDER_PRICING = true

/** @placeholder Monthly price point per Space plan, in cents. Mirrors the code catalog founding rates
 *  (lib/billing/pricing-keys.ts CATALOG): Business $29, Non Profit $39 flat (ADR-811); free at $0. THE ONE
 *  place to swap real Space prices when billing goes live. Preview only; never charged. */
export const PLACEHOLDER_SPACE_PRICE_CENTS: Record<SpacePlan, number> = {
  free: 0,
  business: 2900, // $29 flat, all-in (ADR-811)
  collective: 7900, // $79 list (beta $49 founding is COLLECTIVE_BETA_CENTS below)
  nonprofit: 3900, // $39 flat, verified, full Collective toolkit
  independent: 24900, // ~$249 white-label, network-disconnected (standard SaaS)
}

/** The Collective founding-BETA monthly price (cents): $49 under the $79 list (ADR-811). The ONE source
 *  both the marketing pricing page (pricing-page.ts) and the in-app plan ladder (plan-ladder.tsx) read, so
 *  the beta anchor can never drift between the two surfaces. */
export const COLLECTIVE_BETA_CENTS = 4900

/** @placeholder Monthly price point per personal membership tier, in cents. Mirrors the code defaults
 *  (lib/pricing/settings.ts PRICING_DEFAULTS): Crew $9, Supporter $24. THE ONE place to swap real personal
 *  prices when billing goes live. Preview only; never charged. */
export const PLACEHOLDER_MEMBER_PRICE_CENTS: Record<EntitlementTier, number> = {
  free: 0,
  crew: 900,
  supporter: 2400,
}

// ── The ascending display ladders per axis (a clean upgrade path) ───────────────────────────────────
// The RANGE the selector moves across. Space uses free → business (ADR-552: free-vs-paid is a usage
// state within Business; Non Profit is a sibling verified-501c3 plan, sold separately, not a rung here).
// Personal uses free → crew (Supporter is retired to a pay-what-you-want badge, not a sold rung).

/** The Space plan rungs the range selector shows, ascending. A clean upgrade path (Non Profit is sold
 *  separately, so it is not a rung here). */
export const SPACE_LADDER_TIERS: readonly SpacePlan[] = ['free', 'business', 'collective']

/** The personal membership rungs the range selector shows, ascending (Supporter is retired). */
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

/** The placeholder price cents for a tier on its axis. PURE. (Exported so the sibling meter ladder,
 *  lib/pricing/feature-meters.ts, prices its rungs from the SAME placeholder maps — one price source.) */
export function tierPriceCents(axis: GateAxis, tier: string): number {
  if (axis === 'plan') return PLACEHOLDER_SPACE_PRICE_CENTS[tier as SpacePlan] ?? 0
  return PLACEHOLDER_MEMBER_PRICE_CENTS[tier as EntitlementTier] ?? 0
}

/** A plain, honest placeholder price label for a tier on its axis, reusing the shared display format
 *  (formatCents). "Free" for the floor; "$X/mo" for a flat tier. Non Profit is a FLAT $29/mo (ADR-590),
 *  never per-seat. PURE. */
export function tierPriceLabel(axis: GateAxis, tier: string): string {
  const cents = tierPriceCents(axis, tier)
  if (cents === 0) return 'Free'
  return `${formatCents(cents)}/mo`
}

// ── The per-feature raw config (axis + minTier + what each rung unlocks) ─────────────────────────────
// One entry per tier-gated FEATURE_GATES key. `unlocks` is the plain line the selector prints under each
// rung: the limit/quota or the on/off it grants for THIS feature. No em dashes; honest, no urgency. The
// specific numeric limits (contact caps, monthly send volume, seat counts) are deliberately LEFT
// QUALITATIVE here: those numbers are an owner decision for go-live (flagged in the ADR), not invented.

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
    rungs: spaceRungs(
      'A preview of the pipeline with a capped number of contacts.',
      'The full CRM: pipeline, contacts, private notes, and governed playbooks. Multiple pipelines and team roles come with Collective.',
    ),
  },
  space_email: {
    axis: 'plan',
    minTier: 'business',
    title: 'Email',
    rungs: spaceRungs(
      'A capped number of email sends each month.',
      'Higher sending limits, automations, and saved templates.',
    ),
  },
  space_automation: {
    axis: 'plan',
    minTier: 'collective',
    title: 'Automations',
    rungs: spaceRungs(
      'One pipeline, no automations.',
      'Governed playbooks and multi-step sequences that run the safe, reversible moves for you.',
      'collective',
    ),
  },
  space_team: {
    axis: 'plan',
    minTier: 'collective',
    title: 'Team roles',
    rungs: spaceRungs(
      'One operator seat.',
      'Add teammates with roles: editor, moderator, and admin.',
      'collective',
    ),
  },
  space_collaborators: {
    axis: 'plan',
    minTier: 'collective',
    title: 'Collaborator spaces',
    rungs: spaceRungs(
      'See how collaborators work, and preview the surface.',
      'Host other businesses inside your space and co-host events. They keep their own page and pay for their own space.',
      'collective',
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
