// FEATURE → USAGE METER LADDER + PLACEHOLDER ALLOWANCES (ADR-519, owner directive #4). The PURE,
// client-safe source that answers, for one feature: on which USAGE DIMENSION it is metered (contacts,
// sends per month, seats, …), and how much of it each tier's ALLOWANCE grants. It is the sibling of
// lib/pricing/feature-tiers.ts and shares its placeholder PRICE maps, so a rung reads as an ALLOWANCE
// ("Free: up to 100 · Pro: up to 2,000 · Business: unlimited") plus its price, never as an unlock.
//
// THE MODEL SHIFT (feature-GATES → usage-METERS, owner directive #4). "Monetize using more of a feature
// as needed, rather than pay per feature. All functionality available to any space. They just have to
// pay to play." Every feature is AVAILABLE at every tier (ADR-517 Phase F made Space functions
// universal). The FREE tier gives an allowance; higher tiers RAISE the limit. You pay to use MORE as you
// grow, not to unlock. So a metered feature shows a ladder of ALLOWANCES across the tiers, and the
// lock/upgrade surfaces become "you're on the free allowance, upgrade for more" nudges, never walls.
//
// PLACEHOLDER ALLOWANCES — the numbers are the OWNER's call (flagged in ADR-519). `PLACEHOLDER_ALLOWANCES`
// is the ONE go-live switch for the quantities: while it is true every allowance below is a PREVIEW.
// The real per-tier limits (contact caps, monthly send volume, seat counts) are an owner decision; the
// ALLOWANCES map is the single, obvious constant block to swap for real numbers, mirroring how G marked
// placeholder PRICES. Prices themselves come straight from feature-tiers.ts (one price source).
//
// THE ENFORCEMENT SEAM (billing OFF ⇒ nothing hard-blocks). `withinAllowance(feature, tier, usage, opts)`
// is the ONE place real enforcement will flip on. Today, with `billing_live` OFF, it ALWAYS returns true:
// the meters are INFORMATIONAL / preview only, nothing charges and no usage is hard-blocked. When billing
// goes live the same helper compares usage to the tier's allowance. This is the clean seam a real hard
// limit plugs into later; nothing consults it to block today.
//
// PURE + framework-independent (no Supabase/Next/React), like lib/pricing/plans.ts, so it is trivially
// unit-testable and safe to import into a client component. Copy follows docs/CONTENT-VOICE.md: plain,
// honest, no em dashes, no manufactured urgency, never a dark pattern.

import {
  tierLabelOnAxis,
  tierPriceCents,
  tierPriceLabel,
  tierRankOnAxis,
} from './feature-tiers'
import type { GateAxis } from './gates'

// ── THE GO-LIVE SWITCH (for the QUANTITIES) ─────────────────────────────────────────────────────────

/** THE placeholder-allowance switch (ADR-519). While true, every per-tier allowance in this module is a
 *  PREVIEW: the meters are informational, `withinAllowance` never hard-blocks, and nothing charges. Flip
 *  to false when the real limits are set (and fill the real numbers into the ALLOWANCES below). This is
 *  the single, obvious go-live flag for the QUANTITIES (the sibling PLACEHOLDER_PRICING in
 *  feature-tiers.ts is the flag for the PRICES). */
export const PLACEHOLDER_ALLOWANCES = true

/** The sentinel for an UNLIMITED allowance (a tier with no cap on this dimension). PURE data, so the
 *  ladder + `withinAllowance` treat `null` as "never blocked". */
export type Allowance = number | null // a numeric cap, or null = unlimited

// ── The reset period a meter runs on (shapes the allowance label + readout) ─────────────────────────

/** How a meter's usage is counted: a standing COUNT (contacts, seats — no reset) or a per-PERIOD flow
 *  (sends per month, Vera messages per day). Drives the "/mo", "/day", or bare-count label. */
export type MeterPeriod = 'month' | 'day' | null

// ── The per-feature raw meter config (dimension + per-tier allowance) ────────────────────────────────
// One entry per METERABLE feature. `dimension` is the human noun the ladder heads with; `unit` is the
// short plural for the readout; `period` shapes the label. `allowances` is the per-tier cap on the axis
// ladder (free → paid); `null` = unlimited. THE NUMBERS ARE PLACEHOLDERS (owner decision for go-live).

interface RawMeter {
  axis: GateAxis
  /** The plain feature name the ladder heads with (matches the feature-tiers title). */
  title: string
  /** The usage dimension, human noun ("Contacts", "Email sends", "Team seats"). */
  dimension: string
  /** The short unit for the readout ("contacts", "sends", "seats"). */
  unit: string
  /** The reset period, or null for a standing count. */
  period: MeterPeriod
  /** @placeholder The per-tier allowance on the axis ladder. Number = cap, null = unlimited. THESE ARE
   *  PREVIEW NUMBERS — the real limits are an owner decision (ADR-519). Keys must be tiers on the axis. */
  allowances: Record<string, Allowance>
}

/** @placeholder The per-feature usage-meter ladder. Every value in `allowances` is a PREVIEW number the
 *  owner sets for real before go-live (flagged in ADR-519). Dimensions are drawn only from the real
 *  feature set; a feature with no natural quantity is NOT here (see NON_METERED_FEATURES). */
const RAW_METERS: Record<string, RawMeter> = {
  // ── Space functions (plan axis: free < pro < business < organization) ────────────────────────────
  space_crm: {
    axis: 'plan',
    title: 'CRM',
    dimension: 'Contacts',
    unit: 'contacts',
    period: null,
    // @placeholder contact caps — owner sets real numbers before go-live.
    allowances: { free: 100, pro: 2_000, business: null, organization: null },
  },
  space_email: {
    axis: 'plan',
    title: 'Email',
    dimension: 'Email sends',
    unit: 'sends',
    period: 'month',
    // @placeholder monthly send volume — owner sets real numbers before go-live.
    allowances: { free: 200, pro: 5_000, business: 50_000, organization: null },
  },
  space_automation: {
    axis: 'plan',
    title: 'Automations',
    dimension: 'Active automations',
    unit: 'automations',
    period: null,
    // @placeholder active-automation counts — owner sets real numbers before go-live.
    allowances: { free: 1, pro: 10, business: null, organization: null },
  },
  space_team: {
    axis: 'plan',
    title: 'Team seats',
    dimension: 'Team seats',
    unit: 'seats',
    period: null,
    // @placeholder seat counts — owner sets real numbers before go-live.
    allowances: { free: 1, pro: 3, business: 25, organization: null },
  },
  space_multi_pipeline: {
    axis: 'plan',
    title: 'Pipelines',
    dimension: 'Pipelines',
    unit: 'pipelines',
    period: null,
    // @placeholder pipeline counts — owner sets real numbers before go-live.
    allowances: { free: 1, pro: 3, business: null, organization: null },
  },
  // ── Space AI depth (plan axis; the Resonance Engine metered usage · ADR-387) ─────────────────────
  space_crm_playbooks: {
    axis: 'plan',
    title: 'Governed playbooks',
    dimension: 'Playbook runs',
    unit: 'runs',
    period: 'month',
    // @placeholder monthly playbook auto-runs — owner sets real numbers before go-live.
    allowances: { free: 20, pro: 500, business: 5_000, organization: null },
  },
  space_crm_resonance_ai: {
    axis: 'plan',
    title: 'Resonance Graph',
    dimension: 'Resonance matches',
    unit: 'matches',
    period: 'month',
    // @placeholder monthly AI resonance matches — owner sets real numbers before go-live.
    allowances: { free: 10, pro: 200, business: 2_000, organization: null },
  },
  // ── Personal membership (tier axis: free < crew) ─────────────────────────────────────────────────
  vera_unlimited: {
    axis: 'tier',
    title: 'Vera messages',
    dimension: 'Vera messages',
    unit: 'messages',
    period: 'day',
    // @placeholder daily Vera message allowance — owner sets real numbers before go-live. Crew = no cap.
    allowances: { free: 10, crew: null },
  },
}

// ── Features that stay AVAILABLE with NO meter (no natural quantity to meter) ────────────────────────
// The model keeps every feature available; these carry no sensible per-tier quantity, so they get NO
// meter (they are on/off capabilities, not "use more" dials). `withinAllowance` never blocks them.

/** The tier-gated features that are intentionally NOT metered, each with the reason. Available at every
 *  tier with no usage dimension (an on/off capability, or a depth view whose AI usage is metered
 *  elsewhere). Stated explicitly so the coverage test can assert every gated feature is either metered
 *  or consciously non-metered. */
export const NON_METERED_FEATURES: Record<string, string> = {
  // Branding / custom domain is an on/off capability (you have your own domain or you do not), not a
  // quantity you consume more of. Which tier turns it on stays a feature-tiers ladder concern.
  space_whitelabel: 'On/off capability (your own brand and domain), no natural quantity to meter.',
  // The read-only resonance VIEW is a depth toggle; its AI USAGE is metered on space_crm_resonance_ai
  // (Resonance matches per month), so the view itself carries no separate meter.
  space_crm_resonance: 'Read-only depth view; the AI usage is metered on space_crm_resonance_ai.',
  // Spending Gems / claiming rewards is an on/off unlock on the Crew tier, not a metered quantity (the
  // Gem balance itself is the natural limit, not a per-tier allowance).
  vault_cash_in: 'On/off unlock (spend Gems / claim rewards); the Gem balance is the natural limit.',
  // The full rewards loop (streaks, seasons, ladder) is an on/off experience, not a "use more" dial.
  gamification_full: 'On/off experience (the full rewards loop), no natural quantity to meter.',
}

// ── Allowance label + readout formatting (pure) ──────────────────────────────────────────────────────

/** The plain per-period suffix for a meter ("/mo", "/day", or none for a standing count). PURE. */
function periodSuffix(period: MeterPeriod): string {
  if (period === 'month') return '/mo'
  if (period === 'day') return '/day'
  return ''
}

/** A plain, honest allowance label for one rung. "Up to 100 contacts", "Up to 5,000 sends/mo",
 *  "Unlimited contacts". No urgency, no dark pattern. PURE. */
export function allowanceLabel(allowance: Allowance, unit: string, period: MeterPeriod): string {
  if (allowance == null) return `Unlimited ${unit}`
  const n = allowance.toLocaleString('en-US')
  return `Up to ${n} ${unit}${periodSuffix(period)}`
}

// ── The built meter ladder (labels + placeholder prices + allowance labels filled in) ────────────────

/** One rung of a feature's usage-meter ladder: the tier id, its canon label, its placeholder price
 *  label + cents, this tier's ALLOWANCE (a cap, or null = unlimited) with its plain label, and whether
 *  it is the free floor. Plain data, serializable (safe to pass server → client selector). */
export interface FeatureMeterStep {
  tier: string
  label: string
  /** The formatted placeholder price ("Free", "$19/mo", "from $199/mo", …). Preview only. */
  price: string
  /** Raw placeholder cents, for any caller that computes. */
  priceCents: number
  /** This tier's allowance on the meter dimension. A numeric cap, or null = unlimited. Placeholder. */
  allowance: Allowance
  /** The plain allowance line ("Up to 100 contacts", "Unlimited contacts"). */
  allowanceText: string
  /** True for the free floor rung (the freemium allowance). */
  isFree: boolean
}

/** A feature's full usage-meter ladder: the axis it ranks on, the plain title + dimension, the reset
 *  period, and the ascending rungs with their placeholder allowance + price. Plain data (serializable). */
export interface FeatureMeterLadder {
  featureKey: string
  axis: GateAxis
  title: string
  /** The usage dimension noun ("Contacts", "Email sends"). */
  dimension: string
  /** The short unit for the readout ("contacts", "sends"). */
  unit: string
  /** The reset period, or null for a standing count. */
  period: MeterPeriod
  steps: FeatureMeterStep[]
  /** True while allowances are placeholders and nothing hard-blocks (mirrors PLACEHOLDER_ALLOWANCES). */
  placeholderAllowances: boolean
}

/** The tier order for a meter, ascending by rank on its axis (from the allowance keys). PURE. */
function orderedTiers(raw: RawMeter): string[] {
  return Object.keys(raw.allowances).sort((a, b) => tierRankOnAxis(raw.axis, a) - tierRankOnAxis(raw.axis, b))
}

/** Build the display meter ladder for a raw config entry: fill each rung's label + placeholder price +
 *  allowance line, mark the free floor. PURE. */
function buildMeter(featureKey: string, raw: RawMeter): FeatureMeterLadder {
  const steps: FeatureMeterStep[] = orderedTiers(raw).map((tier) => {
    const allowance = raw.allowances[tier] ?? null
    return {
      tier,
      label: tierLabelOnAxis(raw.axis, tier),
      price: tierPriceLabel(raw.axis, tier),
      priceCents: tierPriceCents(raw.axis, tier),
      allowance,
      allowanceText: allowanceLabel(allowance, raw.unit, raw.period),
      isFree: tierRankOnAxis(raw.axis, tier) === 0,
    }
  })
  return {
    featureKey,
    axis: raw.axis,
    title: raw.title,
    dimension: raw.dimension,
    unit: raw.unit,
    period: raw.period,
    steps,
    placeholderAllowances: PLACEHOLDER_ALLOWANCES,
  }
}

/** Every feature → usage-meter ladder, keyed by feature key (built once from the raw config). */
export const FEATURE_METERS: Record<string, FeatureMeterLadder> = Object.fromEntries(
  Object.entries(RAW_METERS).map(([key, raw]) => [key, buildMeter(key, raw)]),
)

/** Every feature key that has a usage meter (for iteration / coverage checks). */
export const FEATURE_METER_KEYS: readonly string[] = Object.keys(FEATURE_METERS)

// ── Read helpers (pure) ─────────────────────────────────────────────────────────────────────────────

/** The usage-meter ladder for a feature, or null when the feature has no meter (not metered). PURE. */
export function featureMeter(featureKey: string): FeatureMeterLadder | null {
  return FEATURE_METERS[featureKey] ?? null
}

/** The index of the rung that represents a viewer's CURRENT tier on a meter ladder: the highest rung
 *  whose rank is <= the viewer's tier rank (a tier between two rungs maps to the lower rung; a tier
 *  above every rung maps to the top). Defaults to 0 (the free floor) for an unknown / below-first tier.
 *  PURE. */
export function currentMeterStepIndex(ladder: FeatureMeterLadder, tier: string): number {
  const rank = tierRankOnAxis(ladder.axis, tier)
  let idx = 0
  for (let i = 0; i < ladder.steps.length; i++) {
    if (tierRankOnAxis(ladder.axis, ladder.steps[i]!.tier) <= rank) idx = i
  }
  return idx
}

/** The allowance a tier gets on a feature's meter (a cap, or null = unlimited). Null when the feature is
 *  not metered. Maps the tier to its rung via currentMeterStepIndex (default-deny to the free floor).
 *  PURE. */
export function allowanceAt(featureKey: string, tier: string): Allowance {
  const ladder = featureMeter(featureKey)
  if (!ladder) return null // not metered → no cap
  const idx = currentMeterStepIndex(ladder, tier)
  return ladder.steps[idx]?.allowance ?? null
}

/** A plain "X of N used" readout for a viewer's current usage against their tier's allowance, or the
 *  unlimited form. Pure; used by an OPTIONAL usage readout where a real count is cheaply available.
 *  Examples: "12 of 100 contacts used", "12 contacts used (unlimited)". PURE. */
export function allowanceReadout(featureKey: string, tier: string, usage: number): string | null {
  const ladder = featureMeter(featureKey)
  if (!ladder) return null
  const allowance = allowanceAt(featureKey, tier)
  const used = Math.max(0, Math.trunc(usage))
  const n = used.toLocaleString('en-US')
  if (allowance == null) return `${n} ${ladder.unit} used (unlimited)`
  return `${n} of ${allowance.toLocaleString('en-US')} ${ladder.unit} used`
}

// ── THE ENFORCEMENT SEAM (billing OFF ⇒ always true; nothing hard-blocks) ────────────────────────────

/** Is this usage WITHIN the tier's allowance for a feature? THE single enforcement seam for the metered
 *  model (ADR-519).
 *
 *   - Returns `true` (never blocks) while `billing_live` is OFF, so the meters are INFORMATIONAL / preview
 *     during the beta: nothing charges and no usage is hard-blocked. This is today's behavior.
 *   - Returns `true` for a NON-METERED feature (no usage dimension) or an unknown key (default-allow).
 *   - Once billing is live, compares `usage` to the tier's allowance (null allowance = unlimited = true).
 *
 *  The real hard limit plugs in HERE when billing goes live; nothing else needs to change. `billingLive`
 *  is passed in (resolved by the caller via lib/pricing/settings.ts billingLive()), keeping this pure. */
export function withinAllowance(
  featureKey: string,
  tier: string,
  usage: number,
  opts: { billingLive: boolean },
): boolean {
  // OFF = the metered model is preview-only: informational meters, never a hard block. Today's behavior.
  if (!opts.billingLive) return true
  const allowance = allowanceAt(featureKey, tier)
  if (allowance == null) return true // not metered, or an unlimited tier → never blocked
  return usage <= allowance
}
