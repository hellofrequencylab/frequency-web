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

/** @placeholder The fraction of a tier's allowance at which an inline usage meter shows a quiet "Upgrade"
 *  nudge (ADR-520 P2). 0.8 = the nudge appears once usage crosses 80% of the allowance. Informational
 *  only, it blocks nothing. THIS IS A PREVIEW VALUE the owner tunes for go-live, the single constant the
 *  inline meters read. */
export const USAGE_UPGRADE_THRESHOLD = 0.8

/** The ONE nudge sentence a meter surface shows once usage crosses USAGE_UPGRADE_THRESHOLD (ADR-837).
 *  Exported so every surface prints the same line and none invents urgency. It always rides next to a
 *  plain "See plans" link; it never blocks, never counts down, never warns. */
export const ALLOWANCE_NUDGE = 'Nearly full. Move up a plan for a higher allowance.'

/** The sentinel for an UNLIMITED allowance (a tier with no cap on this dimension). PURE data, so the
 *  ladder + `withinAllowance` treat `null` as "never blocked". */
export type Allowance = number | null // a numeric cap, or null = unlimited

// ── The reset period a meter runs on (shapes the allowance label + readout) ─────────────────────────

/** How a meter's usage is counted: a standing COUNT (contacts, seats — no reset) or a per-PERIOD flow
 *  (sends per month, Vera messages per day). Drives the "/mo", "/day", or bare-count label. */
export type MeterPeriod = 'month' | 'day' | null

// ── THE ONE GO-LIVE MAP OF QUANTITIES (ADR-837) ─────────────────────────────────────────────────────

/** @placeholder THE single per-feature, per-tier allowance map — every metered quantity in the product
 *  lives HERE and nowhere else, so the go-live edit is ONE map (the quantities sibling of the
 *  PLACEHOLDER_*_PRICE_CENTS maps in feature-tiers.ts). Number = cap, null = unlimited; keys are tiers on
 *  the feature's axis. EVERY value is a PREVIEW while PLACEHOLDER_ALLOWANCES is true: meters inform, and
 *  `withinAllowance` never hard-blocks (ADR-782 beta-soft). The real limits are the owner's go-live call.
 *
 *  Sources per row (mirrored, not invented, wherever the codebase already carries a number):
 *   - space_crm 250 free            — docs/BUSINESS-MODEL-PLAN §2 (also the console freeNote).
 *   - space_email 300/mo free       — §2; Business 5,000 and Collective 25,000 are the §2 "5k → 25k
 *                                     steps". Separately, lib/spaces/email.ts DAILY_SEND_CAP = 500/day is
 *                                     a LIVE per-day throttle on every plan (deliverability, not pricing).
 *   - space_qr 3 free / 500 Business — MIRRORS the LIVE cap in lib/qr/space-codes.ts PLAN_CODE_CAPS
 *                                     (free 3, business 500). Collective unlimited is a placeholder; the
 *                                     live map has no collective row yet (it falls to the free cap).
 *   - space_automation 1,000 runs/mo on Collective — placeholder included volume (the feature itself is
 *                                     the Collective on/off, FEATURE_GATES.space_automation).
 *   - space_team 1 free             — MIRRORS lib/spaces/seats.ts BASE_SEAT_ALLOWANCE (the owner's seat,
 *                                     ADR-799). Collective 3 = placeholder INCLUDED seats; more seats
 *                                     stay the ADR-799 per-seat add-on, never blocked by this meter.
 *   - space_vera 10/day free        — mirrors PRICING_DEFAULTS.vera_free_daily_cap (§2 "~10 msgs / day").
 *   - bookings 15/mo, journey 10, memberships 10, tickets 50, pipelines 1 — the §2 free-cap table. */
export const PLACEHOLDER_METER_LIMITS: Record<string, Record<string, Allowance>> = {
  space_crm: { free: 250, business: null, collective: null },
  space_email: { free: 300, business: 5_000, collective: 25_000 },
  space_bookings: { free: 15, business: null },
  space_journey: { free: 10, business: null },
  space_memberships: { free: 10, business: null },
  space_tickets: { free: 50, business: null },
  space_qr: { free: 3, business: 500, collective: null },
  space_automation: { free: 0, collective: 1_000 },
  space_team: { free: 1, collective: 3 },
  space_multi_pipeline: { free: 1, collective: null },
  space_vera: { free: 10, business: 200 },
  space_crm_playbooks: { free: 0, business: 5_000 },
  space_crm_resonance_ai: { free: 10, business: 2_000 },
  vera_unlimited: { free: 10, crew: null },
}

// ── The per-feature raw meter config (dimension + per-tier allowance) ────────────────────────────────
// One entry per METERABLE feature. `dimension` is the human noun the ladder heads with; `unit` is the
// short plural for the readout; `period` shapes the label. `allowances` is the per-tier cap on the axis
// ladder (free → paid), ALWAYS read from PLACEHOLDER_METER_LIMITS (one source of quantities, ADR-837).

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
  /** @placeholder The per-tier allowance on the axis ladder — always a PLACEHOLDER_METER_LIMITS row, so
   *  the quantities live in ONE map. Number = cap, null = unlimited. Keys must be tiers on the axis. */
  allowances: Record<string, Allowance>
  /** OPTIONAL per-tier override for the plain allowance line, where the bare "Up to N" would misread
   *  (e.g. Collective seats INCLUDE 3 and more are a per-seat add-on, never a wall · ADR-799). */
  allowanceTextByTier?: Record<string, string>
}

/** @placeholder The per-feature usage-meter ladder. Every quantity comes from PLACEHOLDER_METER_LIMITS
 *  (the ONE go-live map, ADR-837). Dimensions are drawn only from the real feature set; a feature with no
 *  natural quantity is NOT here (see NON_METERED_FEATURES). */
const RAW_METERS: Record<string, RawMeter> = {
  // ── Space functions (plan axis: free < business < collective · ADR-552/ADR-811) ─────────────────
  // The FREE allowances are the docs/BUSINESS-MODEL-PLAN §2 numbers (usage becomes the paywall);
  // Business is high/unlimited (null) except the real cost dials (email sends, AI), which stay a high
  // step. Everything is still dormant while `billing_live` is OFF (withinAllowance short-circuits).
  space_crm: {
    axis: 'plan',
    title: 'CRM',
    dimension: 'Contacts',
    unit: 'contacts',
    period: null,
    // Free: 250 contacts (activation → scale lever, §2). Business and Collective: unlimited.
    allowances: PLACEHOLDER_METER_LIMITS.space_crm!,
  },
  space_email: {
    axis: 'plan',
    title: 'Email',
    dimension: 'Email sends',
    unit: 'sends',
    period: 'month',
    // Free: 300 sends / mo (§2). Business 5,000 / Collective 25,000: the §2 "5k → 25k steps" (email is
    // a real cost dial, never unlimited). The live 500/day throttle (email.ts) is separate.
    allowances: PLACEHOLDER_METER_LIMITS.space_email!,
  },
  space_bookings: {
    axis: 'plan',
    title: 'Bookings',
    dimension: 'Bookings',
    unit: 'bookings',
    period: 'month',
    // Free: 15 bookings / mo (activation lever, §2). Business: unlimited.
    allowances: PLACEHOLDER_METER_LIMITS.space_bookings!,
  },
  space_journey: {
    axis: 'plan',
    title: 'Journey enrollees',
    dimension: 'Active enrollees',
    unit: 'enrollees',
    period: null,
    // Free: 10 active enrollees (activation lever, §2). Business: unlimited.
    allowances: PLACEHOLDER_METER_LIMITS.space_journey!,
  },
  space_memberships: {
    axis: 'plan',
    title: 'Memberships',
    dimension: 'Active memberships',
    unit: 'members',
    period: null,
    // Free: 10 active members, one tier (scale lever, §2). Business: unlimited, multi-tier.
    allowances: PLACEHOLDER_METER_LIMITS.space_memberships!,
  },
  space_tickets: {
    axis: 'plan',
    title: 'Tickets',
    dimension: 'Tickets',
    unit: 'tickets',
    period: null,
    // Free: 50 tickets across one event (scale lever, §2). Business: unlimited.
    allowances: PLACEHOLDER_METER_LIMITS.space_tickets!,
  },
  space_qr: {
    axis: 'plan',
    title: 'QR codes',
    dimension: 'QR codes',
    unit: 'codes',
    period: null,
    // Free 3 / Business 500 MIRROR the live cap (lib/qr/space-codes.ts PLAN_CODE_CAPS). Collective:
    // unlimited (placeholder; the live cap map has no collective row yet).
    allowances: PLACEHOLDER_METER_LIMITS.space_qr!,
  },
  space_automation: {
    axis: 'plan',
    title: 'Automations',
    dimension: 'Automation runs',
    unit: 'runs',
    period: 'month',
    // Free: none (§2: "1 pipeline, no automations"). Collective floor (ADR-811, mirrors
    // FEATURE_GATES.space_automation): the on/off turns ON with 1,000 included runs / mo (placeholder).
    allowances: PLACEHOLDER_METER_LIMITS.space_automation!,
  },
  space_team: {
    axis: 'plan',
    title: 'Team seats',
    dimension: 'Team seats',
    unit: 'seats',
    period: null,
    // Free: 1 seat, the owner's (BASE_SEAT_ALLOWANCE, ADR-799 / §2). Collective: 3 seats INCLUDED
    // (placeholder); more seats are the ADR-799 per-seat add-on, so the top rung is never a wall.
    allowances: PLACEHOLDER_METER_LIMITS.space_team!,
    allowanceTextByTier: {
      free: '1 seat included (the owner)',
      collective: '3 seats included, add more per seat',
    },
  },
  space_multi_pipeline: {
    axis: 'plan',
    title: 'Pipelines',
    dimension: 'Pipelines',
    unit: 'pipelines',
    period: null,
    // Free: 1 pipeline (§2). Collective floor (ADR-811, mirrors FEATURE_GATES.space_multi_pipeline):
    // unlimited.
    allowances: PLACEHOLDER_METER_LIMITS.space_multi_pipeline!,
  },
  // ── Space AI depth (plan axis; the Resonance Engine metered usage · ADR-387) ─────────────────────
  space_vera: {
    axis: 'plan',
    title: 'Vera',
    dimension: 'Vera messages',
    unit: 'messages',
    period: 'day',
    // Free: ~10 Vera messages / day (§2; mirrors PRICING_DEFAULTS.vera_free_daily_cap). Business: more.
    allowances: PLACEHOLDER_METER_LIMITS.space_vera!,
  },
  space_crm_playbooks: {
    axis: 'plan',
    title: 'Governed playbooks',
    dimension: 'Playbook runs',
    unit: 'runs',
    period: 'month',
    // Free: no playbooks (§2: free AI is suggest-only, no autonomous playbooks). Business: a high step.
    allowances: PLACEHOLDER_METER_LIMITS.space_crm_playbooks!,
  },
  space_crm_resonance_ai: {
    axis: 'plan',
    title: 'Resonance Graph',
    dimension: 'Resonance matches',
    unit: 'matches',
    period: 'month',
    // Free: read-only wedge scoring; Business: the full Resonance Graph, a high step (AI is a cost dial).
    allowances: PLACEHOLDER_METER_LIMITS.space_crm_resonance_ai!,
  },
  // ── Personal membership (tier axis: free < crew) ─────────────────────────────────────────────────
  vera_unlimited: {
    axis: 'tier',
    title: 'Vera messages',
    dimension: 'Vera messages',
    unit: 'messages',
    period: 'day',
    // @placeholder daily Vera message allowance — owner sets real numbers before go-live. Crew = no cap.
    allowances: PLACEHOLDER_METER_LIMITS.vera_unlimited!,
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
  // Collaborator hosting (hosting collaborator spaces / hosting events with Collaborators) is an
  // on/off Collective capability of the HOST side (ADR-810/ADR-835), not a metered quantity — the
  // collaborator pays for their own space (being one is free), so the host is never charged per guest.
  space_collaborators: 'On/off capability (Collaborator hosting: collaborator spaces + events with Collaborators), free to host per guest.',
  // Restricting a ticket tier to the space's own members (ADR-823) is an on/off gate on the tier
  // editor, not a quantity — ticket volume is already the space's own sales, never charged per use.
  space_membership_tickets: 'On/off capability (members-only ticket tiers), no natural quantity to meter.',
}

// ── Allowance label + readout formatting (pure) ──────────────────────────────────────────────────────

/** The plain per-period suffix for a meter ("/mo", "/day", or none for a standing count). PURE. */
function periodSuffix(period: MeterPeriod): string {
  if (period === 'month') return '/mo'
  if (period === 'day') return '/day'
  return ''
}

/** A plain, honest allowance label for one rung. "Up to 100 contacts", "Up to 5,000 sends/mo",
 *  "Unlimited contacts". A zero allowance reads "Not included on this plan" (never "Up to 0"); a cap of
 *  exactly 1 drops the plural s ("Up to 1 pipeline"). No urgency, no dark pattern. PURE. */
export function allowanceLabel(allowance: Allowance, unit: string, period: MeterPeriod): string {
  if (allowance == null) return `Unlimited ${unit}`
  if (allowance === 0) return 'Not included on this plan'
  const noun = allowance === 1 ? unit.replace(/s$/, '') : unit
  const n = allowance.toLocaleString('en-US')
  return `Up to ${n} ${noun}${periodSuffix(period)}`
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
      allowanceText: raw.allowanceTextByTier?.[tier] ?? allowanceLabel(allowance, raw.unit, raw.period),
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

/** Has usage crossed the quiet-nudge threshold of the tier's allowance (>= USAGE_UPGRADE_THRESHOLD, so
 *  80% by default)? THE one predicate every meter surface uses to decide when the ALLOWANCE_NUDGE line
 *  and its "See plans" link appear (ADR-837). False for an unlimited tier, a non-metered feature, or a
 *  zero allowance (nothing to fill). Display-only: it gates one sentence, never a feature. PURE. */
export function nearAllowanceLimit(featureKey: string, tier: string, usage: number): boolean {
  const allowance = allowanceAt(featureKey, tier)
  if (allowance == null || allowance <= 0) return false
  return Math.max(0, usage) / allowance >= USAGE_UPGRADE_THRESHOLD
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
