// METER UPSELL — the PURE copy builder + the mount registry for the ONE in-context upsell surface
// (docs/VALUE-LADDER.md Phase 4). A meter with no surface is invisible and cannot convert; a meter with
// four bespoke surfaces is four hand-written copies that drift. So there is exactly one sentence pair,
// built here from the meter config + the operator rate table, and exactly one component that renders it
// (components/pricing/meter-upsell.tsx).
//
// THE FOUR COPY RULES, each mapped to the mechanism it uses (docs/VALUE-LADDER.md §1):
//   1. GOAL-GRADIENT (#4). It appears at USAGE_UPGRADE_THRESHOLD of the allowance (80%), never at 100%,
//      so the prompt arrives while there is still time to decide calmly. The predicate is
//      `nearAllowanceLimit`, which already trips at 80% and is shared with FeatureMeterRange.
//   2. LOSS AVERSION (#3). The first sentence names what the member ALREADY BUILT ("You have 187
//      contacts"), never what they lack. There is no sentence anywhere in this file about a missing
//      feature.
//   3. THE RATE IS THE LADDER (§2). The second sentence names the RATE improvement as well as the cap
//      lift, because after ADR-914 the rate is what a rung actually buys. Both numbers are read from
//      config: the caps from PLACEHOLDER_METER_LIMITS via the meter ladder, the rate from
//      pricing_settings.take_rate. Nothing here hardcodes a rung.
//   4. NO DARK PATTERNS (§1). No countdown, no scarcity, no invented seat count, and never a hint that
//      anything is removed at a cap. The standing promise line says the opposite, in the affirmative:
//      your own people stay 0%, and what you built stays.
//
// PURE + framework-independent (no Supabase/Next/React), like feature-meters.ts, so the copy is unit
// testable and the component around it is a thin server seam. Voice per docs/CONTENT-VOICE.md §10:
// plain sentences, concrete numbers, no narrated feelings, no em dashes.

import {
  currentMeterStepIndex,
  featureMeter,
  nearAllowanceLimit,
  PLACEHOLDER_METER_LIMITS,
  type FeatureMeterStep,
  type MeterPeriod,
} from './feature-meters'
import { formatBps } from './display'
import type { GateAxis } from './gates'

// ── The rate ladder this module reads (structurally satisfied by pricing_settings.take_rate) ────────

/** The slice of the operator take-rate table the upsell copy needs. Declared structurally rather than
 *  imported from the settings shape so this module stays pure and the test can build one by hand. The
 *  live object is `(await getPricingValues()).take_rate`. */
export interface MeterRateLadder {
  /** NETWORK-sourced take rate in basis points, per Space plan (free 1000 → business 500 → …). */
  network_bps: Record<string, number>
  /** The free Member rung, in basis points. The reference rate the whole ladder descends from. */
  member_free_bps: number
  /** The Crew rung, in basis points. */
  member_bps: number
}

/** The NETWORK-sourced take rate, in basis points, that a tier pays on a feature's axis. The plan axis
 *  reads the per-plan vector; the personal tier axis reads the two member rungs (free vs paid). Null
 *  when the axis has no rate for that tier (an unknown key), so the copy drops the rate clause rather
 *  than inventing one. PURE. */
export function meterRateBps(axis: GateAxis, tier: string, rates: MeterRateLadder): number | null {
  if (axis === 'plan') {
    const bps = rates.network_bps?.[tier]
    return typeof bps === 'number' ? bps : null
  }
  // The personal axis has exactly two rungs: a free Member and a paying one (Crew).
  const bps = tier === 'free' ? rates.member_free_bps : rates.member_bps
  return typeof bps === 'number' ? bps : null
}

// ── The built copy ──────────────────────────────────────────────────────────────────────────────────

/** The three plain sentences an in-context meter upsell shows, plus the next rung's label for the CTA.
 *  Serializable, so the server seam can hand it straight to a presentational component. */
export interface MeterUpsellCopy {
  featureKey: string
  /** The meter's dimension noun ("Contacts", "Email sends"), for the surface's own heading. */
  dimension: string
  /** WHAT YOU HAVE. Names the member's own count first, then the rung it sits in. Never a lack. */
  have: string
  /** WHAT CHANGES. The cap lift AND the rate improvement, both read from config. */
  change: string
  /** The standing promise: 0% on your own people, and everything you built stays. */
  promise: string
  /** The next rung's canon label ("Crew", "Business Space"), for the CTA. */
  nextLabel: string
}

/** The plain "this period" phrase for a metered flow, or empty for a standing count. PURE. */
function periodPhrase(period: MeterPeriod): string {
  if (period === 'month') return ' this month'
  if (period === 'day') return ' today'
  return ''
}

/** The plain "per period" phrase a cap carries ("a month", "a day"), or empty. PURE. */
function perPeriod(period: MeterPeriod): string {
  if (period === 'month') return ' a month'
  if (period === 'day') return ' a day'
  return ''
}

/** The unit noun agreeing with a count, so a member with one Circle reads "1 circle" and not
 *  "1 circles". Mirrors allowanceLabel's rule in feature-meters.ts, which drops the plural s at
 *  exactly 1. Real caps here are 1 and 2 often enough that this is the common case, not an edge. PURE. */
function countedUnit(n: number, unit: string): string {
  return n === 1 ? unit.replace(/s$/, '') : unit
}

/** The sentence naming what the member ALREADY HAS (loss aversion, §1 #3). Both halves are about their
 *  own work: their count, then the allowance the rung they are on carries. PURE. */
function haveSentence(used: number, cap: number, unit: string, period: MeterPeriod, currentLabel: string): string {
  const n = used.toLocaleString('en-US')
  const c = cap.toLocaleString('en-US')
  const verb = period === null ? 'You have' : 'You have used'
  return `${verb} ${n} ${countedUnit(used, unit)}${periodPhrase(period)}. ${currentLabel} carries ${c}${perPeriod(period)}.`
}

/** The sentence naming WHAT CHANGES: the cap lift, then the rate improvement (§2, the rate is the
 *  ladder now). The rate clause is dropped when the two rungs pay the same rate or either is unknown,
 *  so the copy never claims a saving that is not real. PURE. */
function changeSentence(
  next: FeatureMeterStep,
  unit: string,
  period: MeterPeriod,
  currentBps: number | null,
  nextBps: number | null,
): string {
  const lift =
    next.allowance == null
      ? `${next.label} makes that unlimited`
      : `${next.label} raises that to ${next.allowance.toLocaleString('en-US')} ${countedUnit(next.allowance, unit)}${perPeriod(period)}`
  const rateMoves =
    typeof currentBps === 'number' && typeof nextBps === 'number' && nextBps < currentBps
  return rateMoves
    ? `${lift}, and takes your rate on network-sourced sales from ${formatBps(currentBps!)} to ${formatBps(nextBps!)}.`
    : `${lift}.`
}

/** The standing promise. Stated in the AFFIRMATIVE on purpose: a meter never deletes, hides, or locks
 *  what is already there (docs/VALUE-LADDER.md §1, dark pattern #1), so the line says what stays rather
 *  than reassuring about a loss we would never cause. PURE. */
export const METER_UPSELL_PROMISE =
  'Sales to your own people stay 0% on every plan, and everything you have already built stays where it is.'

/** The single CTA label every in-context meter upsell uses. Plain, navigational, never a checkout. */
export const METER_UPSELL_CTA = 'See plans'

export interface MeterUpsellInput {
  /** The pricing feature key (a PLACEHOLDER_METER_LIMITS row, e.g. 'space_crm', 'circle_host'). */
  featureKey: string
  /** The viewer's CURRENT tier on the meter's axis (the Space plan, or the membership tier). */
  currentTier: string
  /** The viewer's real usage on the meter's dimension. */
  usage: number
  /** The operator take-rate table (`(await getPricingValues()).take_rate`). */
  rates: MeterRateLadder
}

/**
 * Build the in-context upsell copy for one meter, or NULL when there is nothing honest to say.
 *
 * Returns null when:
 *   - the key has no meter (nothing to measure),
 *   - usage is below USAGE_UPGRADE_THRESHOLD of the allowance (goal-gradient: the prompt is for 80%,
 *     not for the first contact and not for the wall),
 *   - the current rung is unlimited or zero (nothing to fill), or
 *   - there is no higher rung (already at the top: an upsell would be a lie).
 *
 * PURE.
 */
export function buildMeterUpsell(input: MeterUpsellInput): MeterUpsellCopy | null {
  const ladder = featureMeter(input.featureKey)
  if (!ladder) return null

  // GOAL-GRADIENT (§1 #4). The ONE shared 80% predicate, so this surface and FeatureMeterRange agree
  // about when a member is "nearly full". It is already false for an unlimited or zero allowance.
  if (!nearAllowanceLimit(input.featureKey, input.currentTier, input.usage)) return null

  const currentIdx = currentMeterStepIndex(ladder, input.currentTier)
  const current = ladder.steps[currentIdx]
  const next = ladder.steps[currentIdx + 1]
  // No higher rung, or a rung that is not actually more room: say nothing rather than upsell a member
  // who is already at the top of the ladder.
  if (!current || !next || current.allowance == null) return null
  if (next.allowance != null && next.allowance <= current.allowance) return null

  const currentBps = meterRateBps(ladder.axis, current.tier, input.rates)
  const nextBps = meterRateBps(ladder.axis, next.tier, input.rates)

  return {
    featureKey: input.featureKey,
    dimension: ladder.dimension,
    have: haveSentence(
      Math.max(0, Math.trunc(input.usage)),
      current.allowance,
      ladder.unit,
      ladder.period,
      current.label,
    ),
    change: changeSentence(next, ladder.unit, ladder.period, currentBps, nextBps),
    promise: METER_UPSELL_PROMISE,
    nextLabel: next.label,
  }
}

// ── THE MOUNT REGISTRY (the thing that makes a new meter impossible to ship invisible) ──────────────
//
// Phase 4's "done when" is: a test enumerates PLACEHOLDER_METER_LIMITS and asserts each key appears in
// the registry. That test (meter-upsell.test.ts) is only worth having if the registry cannot be
// satisfied by typing a filename, so each row is checked three ways: the file must exist, an
// 'in-context' row's file must literally reference the feature key, and a 'ladder' row's file must
// mount the axis-wide meter ladder. A row whose axis disagrees with the meter's own axis fails too.

/** How a meter's upsell reaches the member. */
export type MeterUpsellKind =
  /** A dedicated surface at the point of use: the member sees it while doing the thing being metered. */
  | 'in-context'
  /** The axis-wide allowance ladder (the Space plan-and-usage hub, or the member upgrade page), which
   *  renders every meter on that axis with its own 80% nudge. The honest fallback for a meter whose
   *  real count is not cheaply in scope at the authoring surface. */
  | 'ladder'

export interface MeterUpsellSurface {
  /** The repo-relative file that mounts the upsell for this meter. Asserted to exist. */
  mount: string
  /** How it reaches the member. Drives what the guard test asserts about `mount`. */
  kind: MeterUpsellKind
  /** Why this is the right surface for this meter. One plain sentence for the next reader. */
  note: string
}

/** THE registry: every metered feature key → where its upsell actually renders. A new row in
 *  PLACEHOLDER_METER_LIMITS with no row here fails `meter-upsell.test.ts`, which is the whole point:
 *  a meter that nobody can see is a promise nobody can act on. */
export const METER_UPSELL_SURFACES: Record<string, MeterUpsellSurface> = {
  // ── Plan axis. The Space plan-and-usage hub renders every plan meter's ladder; the rows marked
  // 'in-context' additionally carry the 80% prompt where the member does the work.
  space_crm: {
    mount: 'app/(main)/spaces/[slug]/crm/page.tsx',
    kind: 'in-context',
    note: 'The CRM board itself, on the WORKING path (not only the locked state), against a head-only contact count.',
  },
  space_email: {
    mount: 'app/(main)/spaces/[slug]/settings/email/email-body.tsx',
    kind: 'in-context',
    note: 'The composer, on the WORKING path, against this calendar month of sends (the window the meter names).',
  },
  space_bookings: {
    mount: 'app/(main)/spaces/[slug]/settings/billing/billing-body.tsx',
    kind: 'ladder',
    note: 'Bookings-per-month has no cheap count on the availability editor; the plan hub carries the ladder.',
  },
  space_journey: {
    mount: 'app/(main)/spaces/[slug]/settings/billing/billing-body.tsx',
    kind: 'ladder',
    note: 'Active enrollees are counted per Journey, not per Space; the plan hub carries the ladder.',
  },
  space_journey_publish: {
    mount: 'app/(main)/spaces/[slug]/settings/billing/billing-body.tsx',
    kind: 'ladder',
    note: 'The live publish cap already refuses at the publish action; the plan hub carries the ladder.',
  },
  space_tickets: {
    mount: 'app/(main)/spaces/[slug]/settings/billing/billing-body.tsx',
    kind: 'ladder',
    note: 'Tickets sold are an order-level count, not in scope on the tier editor; the plan hub carries the ladder.',
  },
  space_qr: {
    mount: 'app/(main)/spaces/[slug]/settings/qr/qr-body.tsx',
    kind: 'in-context',
    note: 'The QR studio already lists the codes, so the real count is free.',
  },
  space_automation: {
    mount: 'app/(main)/spaces/[slug]/settings/automation/automation-body.tsx',
    kind: 'in-context',
    note: 'The automation console, which already renders the plan notice with this key.',
  },
  space_team: {
    mount: 'app/(main)/spaces/[slug]/settings/members/members-body.tsx',
    kind: 'in-context',
    note: 'Where seats are actually added, not only on the billing page. Seat usage is already read here.',
  },
  space_multi_pipeline: {
    mount: 'app/(main)/spaces/[slug]/settings/billing/billing-body.tsx',
    kind: 'ladder',
    note: 'Pipelines are a Collective on/off in practice; the plan hub carries the ladder.',
  },
  space_vera: {
    mount: 'app/(main)/spaces/[slug]/settings/billing/billing-body.tsx',
    kind: 'ladder',
    note: 'Space Vera turns are counted on the personal ledger, not per Space; the plan hub carries the ladder.',
  },
  space_crm_playbooks: {
    mount: 'app/(main)/spaces/[slug]/settings/billing/billing-body.tsx',
    kind: 'ladder',
    note: 'Free allowance is zero, so the 80% prompt never applies; the plan hub carries the ladder.',
  },
  space_crm_resonance_ai: {
    mount: 'app/(main)/spaces/[slug]/settings/billing/billing-body.tsx',
    kind: 'ladder',
    note: 'Resonance matches are a background rollup; the plan hub carries the ladder.',
  },
  space_collaborators: {
    mount: 'app/(main)/spaces/[slug]/settings/billing/billing-body.tsx',
    kind: 'ladder',
    note: 'Free allowance is zero, so the 80% prompt never applies; the plan hub carries the ladder.',
  },
  space_membership_tiers: {
    mount: 'app/(main)/spaces/[slug]/settings/memberships/section.tsx',
    kind: 'in-context',
    note: 'The tier editor already holds the full tier list, so the real count is free.',
  },
  // ── Personal tier axis. All six were total gaps: the plan hub filters to axis === 'plan' and the
  // member upgrade page mounted no meter at all. /upgrade is now the tier-axis ladder, and the two
  // authoring surfaces that already hold a real count carry the 80% prompt as well.
  vera_unlimited: {
    mount: 'app/(main)/upgrade/page.tsx',
    kind: 'ladder',
    note: 'The member upgrade page, with today real Vera turn count from the ai_usage ledger.',
  },
  journey_publish: {
    mount: 'app/(main)/journeys/mine/page.tsx',
    kind: 'in-context',
    note: 'Your Journeys, which already separates published from drafts, so the real count is free.',
  },
  journey_enrollees: {
    mount: 'app/(main)/upgrade/page.tsx',
    kind: 'ladder',
    note: 'Active enrollees span every Journey a member runs; the upgrade page carries the ladder.',
  },
  circle_host: {
    mount: 'app/(main)/upgrade/page.tsx',
    kind: 'ladder',
    note: 'The Circles index is a Puck template and /lead is module-driven, so neither holds a hosted count; the upgrade page carries the ladder.',
  },
  practice_publish: {
    mount: 'app/(main)/upgrade/page.tsx',
    kind: 'ladder',
    note: 'Published Practices are not counted on the practice index; the upgrade page carries the ladder.',
  },
  event_create: {
    mount: 'app/(main)/upgrade/page.tsx',
    kind: 'ladder',
    note: 'Active events span circles and Spaces; the upgrade page carries the ladder.',
  },
}

/** The registered upsell surface for a meter key, or null when none is registered. PURE. */
export function meterUpsellSurface(featureKey: string): MeterUpsellSurface | null {
  return METER_UPSELL_SURFACES[featureKey] ?? null
}

/** Every metered key that has NO registered surface. Empty is the contract; the guard test asserts it.
 *  Exported so the failure message can name the offenders rather than a bare count. PURE. */
export function unmountedMeterKeys(): string[] {
  return Object.keys(PLACEHOLDER_METER_LIMITS).filter((k) => !METER_UPSELL_SURFACES[k])
}
