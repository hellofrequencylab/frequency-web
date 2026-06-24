// Pure trait computation (ADR-069 Phase 2). Turns per-member ledger aggregates
// (from the member_engagement_stats RPC) into registry-governed trait values. No
// I/O — fully unit-tested; the refresh job (lib/traits/refresh.ts) handles fetch +
// upsert. Each output key matches a `computed` entry in lib/traits/registry.ts.

export interface MemberStats {
  /** profiles.created_at */
  createdAt: string
  /** max(engagement_events.created_at), or null if no activity */
  lastEventAt: string | null
  /** first 'practice.verified' event, or null if never activated */
  firstVerifiedPracticeAt: string | null
  distinctActiveDays30: number
  verifiedPractices7d: number
  eventCount30d: number
}

export type LifecycleStage = 'new' | 'activated' | 'engaged' | 'at_risk' | 'dormant'

export type TraitValueType = 'number' | 'string' | 'timestamp' | 'boolean' | 'enum'
export interface ComputedTrait {
  key: string
  type: TraitValueType
  value: number | string | boolean | null
}

const DAY_MS = 86_400_000
const daysBetween = (fromIso: string, toMs: number) => (toMs - Date.parse(fromIso)) / DAY_MS

/** ISO week label, e.g. "2026-W22" — the cohort axis. */
export function isoWeek(iso: string): string {
  const d = new Date(Date.parse(iso))
  // Shift to Thursday of the current week, then count weeks from year start (ISO-8601).
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNum = (date.getUTCDay() + 6) % 7 // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / DAY_MS - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** Where the member sits in their journey. Stateless approximation (no prior-state,
 *  so 'reactivated' is deferred to the stateful Phase 5). */
export function lifecycleStage(stats: MemberStats, now: number): LifecycleStage {
  if (!stats.lastEventAt) {
    // Never recorded activity: a recent joiner is 'new'; an old silent one is 'dormant'.
    return daysBetween(stats.createdAt, now) <= 30 ? 'new' : 'dormant'
  }
  const daysSinceActive = daysBetween(stats.lastEventAt, now)
  if (daysSinceActive > 30) return 'dormant'
  if (daysSinceActive > 14) return 'at_risk'
  if (stats.firstVerifiedPracticeAt) return daysSinceActive <= 7 ? 'engaged' : 'activated'
  return 'new'
}

/** Recency (1–5) from days since last activity. */
export function rfmRecency(stats: MemberStats, now: number): number {
  if (!stats.lastEventAt) return 1
  const d = daysBetween(stats.lastEventAt, now)
  if (d <= 2) return 5
  if (d <= 7) return 4
  if (d <= 14) return 3
  if (d <= 30) return 2
  return 1
}

/** Frequency (1–5) from 30-day event volume. */
export function rfmFrequency(stats: MemberStats): number {
  const n = stats.eventCount30d
  if (n >= 20) return 5
  if (n >= 10) return 4
  if (n >= 4) return 3
  if (n >= 1) return 2
  return 1
}

/** Combined RFM score, recency in the tens place, frequency in the units (11–55). */
export function rfmScore(stats: MemberStats, now: number): number {
  return rfmRecency(stats, now) * 10 + rfmFrequency(stats)
}

// ── Behavioral feature store (PI.2 / ADR-166) ────────────────────────────────
// Derived from the raw interaction_events firehose (not the semantic ledger). The
// durable per-member aggregate the AI + reward engine read. Pure; the refresh job
// sources these from the member_interaction_stats RPC and upserts them as member_traits.

export interface InteractionStats {
  lastInteractionAt: string | null
  interactionCount30: number
  interactionDays30: number
  surfacesTouched30: number
  /** total dwell milliseconds over 30d */
  dwellMs30: number
  sessions30: number
  /** average scroll-depth milestone, 0–100 */
  scrollDepthAvg: number
}

export type EngagementDepth = 'idle' | 'shallow' | 'moderate' | 'deep'

/** Composite behavioral band from how OFTEN (active days) and how LONG (dwell) a member
 *  engages — a coarse feature the AI + reward rules read without re-deriving. */
export function engagementDepth(s: InteractionStats): EngagementDepth {
  if (s.interactionDays30 === 0) return 'idle'
  const minutes = s.dwellMs30 / 60_000
  if (s.interactionDays30 >= 8 && minutes >= 30) return 'deep'
  if (s.interactionDays30 >= 3 || minutes >= 10) return 'moderate'
  return 'shallow'
}

/** All registry-governed BEHAVIORAL traits for one member (the firehose feature store). */
export function computeBehavioralTraits(s: InteractionStats): ComputedTrait[] {
  return [
    { key: 'interaction_count_30', type: 'number', value: s.interactionCount30 },
    { key: 'interaction_days_30', type: 'number', value: s.interactionDays30 },
    { key: 'surfaces_touched_30', type: 'number', value: s.surfacesTouched30 },
    { key: 'dwell_minutes_30', type: 'number', value: Math.round(s.dwellMs30 / 60_000) },
    { key: 'sessions_30', type: 'number', value: s.sessions30 },
    { key: 'scroll_depth_avg', type: 'number', value: Math.round(s.scrollDepthAvg) },
    { key: 'last_interaction_at', type: 'timestamp', value: s.lastInteractionAt },
    { key: 'engagement_depth', type: 'enum', value: engagementDepth(s) },
  ]
}

// ── Prediction layer (PI.3 / ADR-166) ───────────────────────────────────────
// Forward-looking inferences over the feature store — heuristic v1 (rules over the
// already-computed features), so a model/Claude-graded path can later slot in behind
// the same keys. Pure; the refresh job feeds it the merged ledger + behavioral view.

export type ChurnRisk = 'low' | 'medium' | 'high'
export type NextBestAction = 'reengage' | 'activate' | 'join_circle' | 'deepen' | 'invite' | 'none'

export interface PredictiveInputs {
  lifecycle: LifecycleStage
  rfmScore: number
  activated: boolean
  engagementDepth: EngagementDepth
  interactionDays30: number
  surfaces30: number
  sessions30: number
  tenureDays: number
}

/** Likelihood the member is drifting away. Recency/lifecycle dominate; shallow on-site
 *  depth pushes a wobbly member up a band, deep engagement pulls them down. */
export function churnRisk(p: PredictiveInputs): ChurnRisk {
  if (p.lifecycle === 'dormant') return 'high'
  if (p.lifecycle === 'at_risk') return p.engagementDepth === 'idle' || p.engagementDepth === 'shallow' ? 'high' : 'medium'
  if (p.lifecycle === 'new') return p.engagementDepth === 'idle' ? 'medium' : 'low'
  // engaged / activated
  return p.engagementDepth === 'idle' ? 'medium' : 'low'
}

/** 0–100 propensity to activate (reach first verified practice). Already-activated → 100;
 *  otherwise scaled from early-engagement breadth + return frequency. */
export function activationPropensity(p: PredictiveInputs): number {
  if (p.activated) return 100
  const raw = p.interactionDays30 * 8 + p.surfaces30 * 4 + p.sessions30 * 3
  // New joiners with no signal yet keep a small baseline so they're not written off.
  const baseline = p.tenureDays <= 14 ? 10 : 0
  return Math.max(0, Math.min(100, Math.round(raw + baseline)))
}

/** The single highest-leverage nudge right now — a priority ladder, most-urgent first. */
export function nextBestAction(p: PredictiveInputs): NextBestAction {
  if (p.lifecycle === 'dormant' || p.lifecycle === 'at_risk') return 'reengage'
  if (!p.activated) return 'activate'
  if (p.engagementDepth === 'deep') return 'invite' // a power user — ask them to bring people
  if (p.surfaces30 <= 2) return 'deepen' // active but narrow — widen their use
  if (p.rfmScore < 30) return 'join_circle' // present but light — anchor them in a circle
  return 'none'
}

/** All registry-governed PREDICTED traits for one member (the prediction layer). */
export function computePredictiveTraits(p: PredictiveInputs): ComputedTrait[] {
  return [
    { key: 'churn_risk', type: 'enum', value: churnRisk(p) },
    { key: 'activation_propensity', type: 'number', value: activationPropensity(p) },
    { key: 'next_best_action', type: 'enum', value: nextBestAction(p) },
  ]
}

/** Build the prediction inputs from the two stat views + clock (the refresh seam). */
export function predictiveInputs(stats: MemberStats, istats: InteractionStats, now: number): PredictiveInputs {
  return {
    lifecycle: lifecycleStage(stats, now),
    rfmScore: rfmScore(stats, now),
    activated: stats.firstVerifiedPracticeAt != null,
    engagementDepth: engagementDepth(istats),
    interactionDays30: istats.interactionDays30,
    surfaces30: istats.surfacesTouched30,
    sessions30: istats.sessions30,
    tenureDays: Math.max(0, daysBetween(stats.createdAt, now)),
  }
}

// ── Resonance Health (the one shared dashboard score · ADR-383) ──────────────
// ONE governed 0-100 number every dashboard altitude shares (platform, Space, person),
// so they all speak the same language. A weighted rollup of the signals that ALREADY
// exist in the feature store: how deeply a member engages (engagement_depth), how
// recently + often (rfm_score), whether they are weekly-active (wam_status), and the
// predicted churn risk pulling against all of it. PURE + unit-tested; the per-signal
// "why" (explainability) is Phase 3, so this emits only the number + its tier.

export type ResonanceTier = 'resonant' | 'cooling' | 'at_risk'

/** The inputs to the Resonance Health rollup. Every field is an already-computed trait
 *  (or a cheap derivation of one), so the score never needs a new data source. */
export interface ResonanceHealthInputs {
  engagementDepth: EngagementDepth
  /** rfm_score in [11, 55] (recency tens + frequency units). */
  rfmScore: number
  /** wam_status: at least one verified practice in the trailing 7 days. */
  weeklyActive: boolean
  churnRisk: ChurnRisk
}

// Each band maps to a 0..1 contribution; the weights below sum to 1.
const DEPTH_POINTS: Record<EngagementDepth, number> = { idle: 0, shallow: 0.34, moderate: 0.67, deep: 1 }
const CHURN_DRAG: Record<ChurnRisk, number> = { low: 1, medium: 0.5, high: 0 }
// The weights of the four signals (sum to 1). Engagement depth + churn carry the most;
// RFM is the recency/frequency tie-breaker; weekly-active is the binary North Star nudge.
const W_DEPTH = 0.35
const W_RFM = 0.25
const W_WAM = 0.1
const W_CHURN = 0.3

/** Normalize rfm_score (11..55) to 0..1. Out-of-range values clamp, so a malformed trait
 *  can never push the health above 100 or below 0. */
function rfmNormalized(rfm: number): number {
  if (!Number.isFinite(rfm)) return 0
  const clamped = Math.max(11, Math.min(55, rfm))
  return (clamped - 11) / (55 - 11)
}

/**
 * The Resonance Health score, 0 to 100. PURE + deterministic. A weighted rollup of
 * engagement depth, RFM, weekly-active status, and (as a drag) predicted churn risk.
 * Always lands in [0, 100] (every term is clamped), so the dashboard can color it safely.
 */
export function resonanceHealth(p: ResonanceHealthInputs): number {
  const depth = DEPTH_POINTS[p.engagementDepth] ?? 0
  const rfm = rfmNormalized(p.rfmScore)
  const wam = p.weeklyActive ? 1 : 0
  const churn = CHURN_DRAG[p.churnRisk] ?? 0
  const raw = W_DEPTH * depth + W_RFM * rfm + W_WAM * wam + W_CHURN * churn
  return Math.max(0, Math.min(100, Math.round(raw * 100)))
}

/**
 * Band the Resonance Health number into the dashboard's three-color legend. PURE.
 * Resonant (green, healthy) at 67+, Cooling (amber, slipping) at 34..66, At risk (red,
 * needs you) below 34. The thresholds match the StatCard green/amber/red legend.
 */
export function resonanceTier(health: number): ResonanceTier {
  if (!Number.isFinite(health) || health < 34) return 'at_risk'
  if (health < 67) return 'cooling'
  return 'resonant'
}

/** The two Resonance Health traits for one member (the shared dashboard score + tier). */
export function computeResonanceTraits(p: ResonanceHealthInputs): ComputedTrait[] {
  const health = resonanceHealth(p)
  return [
    { key: 'resonance_health', type: 'number', value: health },
    { key: 'resonance_tier', type: 'enum', value: resonanceTier(health) },
  ]
}

/** Assemble the Resonance Health inputs from the member + interaction stat views + clock
 *  (the refresh seam). Reuses the existing engagement/RFM/WAM/churn derivations, so the
 *  health score never drifts from the traits it summarizes. */
export function resonanceHealthInputs(stats: MemberStats, istats: InteractionStats, now: number): ResonanceHealthInputs {
  return {
    engagementDepth: engagementDepth(istats),
    rfmScore: rfmScore(stats, now),
    weeklyActive: stats.verifiedPractices7d >= 1,
    churnRisk: churnRisk(predictiveInputs(stats, istats, now)),
  }
}

// ── Explainability (the "why" behind every score · Resonance Engine Phase 3 · ADR-384) ──
// A bare score is never shown again (docs/NEXT-GEN-CRM.md "Every insight is a one-tap action").
// These are SIBLING exports: they leave the numeric/enum return shapes above UNCHANGED (Phase 1/2
// callers are untouched) and add an ordered, top-N "drivers" array so the surface can render a
// "why now / top signals" line + a confidence chip. PURE + deterministic + unit-tested: given the
// same inputs, the same drivers come back in the same priority order. No IO, no copy generation
// here (the in-voice line is shaped at the surface); these are the structured reasons only.

/** One contributing signal behind a score. `weight` is the driver's pull (higher = stronger), used
 *  only to ORDER the reasons; the `label` is the plain, surface-ready phrase (no em or en dashes). */
export interface ScoreReason {
  /** A stable signal key (e.g. 'lifecycle', 'engagement_depth') for testing + analytics. */
  signal: string
  /** The plain, in-voice phrase naming the driver. No dashes. */
  label: string
  /** Relative pull (0..1) used to order the drivers, most-decisive first. */
  weight: number
}

/** Confidence in a score, from how much signal it rests on. `high` = several strong drivers agree;
 *  `low` = thin or conflicting signal (a brand-new member, an idle account). Drives the chip. */
export type ScoreConfidence = 'low' | 'medium' | 'high'

/** A score plus its ordered reasons + a confidence band. The shape the surfaces consume. The
 *  underlying score keeps its native type (enum churn, number propensity), unchanged from above. */
export interface ScoreWithReasons<T> {
  value: T
  /** Top drivers, most-decisive first (already sorted + capped). */
  reasons: ScoreReason[]
  confidence: ScoreConfidence
}

const DEPTH_LABEL: Record<EngagementDepth, string> = {
  idle: 'no on-site activity',
  shallow: 'light on-site activity',
  moderate: 'steady on-site activity',
  deep: 'deep, frequent engagement',
}

const LIFECYCLE_DRIVER: Record<LifecycleStage, string> = {
  new: 'just joined',
  activated: 'activated but cooling',
  engaged: 'showing up regularly',
  at_risk: 'has started to drift',
  dormant: 'has gone quiet',
}

/** Order reasons most-decisive first + keep the top `cap` (default 3). PURE. A stable sort by
 *  weight desc, then signal name, so the same inputs always yield the same order. */
function topReasons(reasons: ScoreReason[], cap = 3): ScoreReason[] {
  return [...reasons]
    .sort((a, b) => (b.weight !== a.weight ? b.weight - a.weight : a.signal < b.signal ? -1 : a.signal > b.signal ? 1 : 0))
    .slice(0, cap)
}

/**
 * Churn risk WITH its top drivers + confidence. PURE. The numeric/enum verdict is the unchanged
 * `churnRisk(p)`; this adds the ordered "why". Lifecycle dominates (it sets the band), engagement
 * depth is the tie-breaker that pushes a wobbly member up or pulls them down, recency (rfm) backs it.
 * Confidence is `high` for the clear ends (dormant, or healthy+engaged), `low` for a brand-new
 * account with no depth yet (the thin-signal case), `medium` otherwise.
 */
export function explainChurnRisk(p: PredictiveInputs): ScoreWithReasons<ChurnRisk> {
  const value = churnRisk(p)
  const reasons: ScoreReason[] = []

  // Lifecycle is the band-setter, so it leads.
  reasons.push({
    signal: 'lifecycle',
    label: LIFECYCLE_DRIVER[p.lifecycle],
    weight: p.lifecycle === 'dormant' ? 1 : p.lifecycle === 'at_risk' ? 0.8 : 0.5,
  })

  // Engagement depth: the lever that moves a member within their band.
  const idleOrShallow = p.engagementDepth === 'idle' || p.engagementDepth === 'shallow'
  reasons.push({ signal: 'engagement_depth', label: DEPTH_LABEL[p.engagementDepth], weight: idleOrShallow ? 0.7 : 0.4 })

  // Recency, read off the rfm tens place, as supporting signal.
  const recency = Math.floor(p.rfmScore / 10)
  if (recency <= 2) reasons.push({ signal: 'recency', label: 'not active recently', weight: 0.6 })
  else if (recency >= 4) reasons.push({ signal: 'recency', label: 'active in the last week', weight: 0.3 })

  // Confidence: clear at the ends, thin for a brand-new idle account.
  let confidence: ScoreConfidence = 'medium'
  if (
    p.lifecycle === 'dormant' ||
    (p.lifecycle === 'engaged' && (p.engagementDepth === 'deep' || p.engagementDepth === 'moderate'))
  ) {
    confidence = 'high'
  } else if (p.lifecycle === 'new' && p.engagementDepth === 'idle') {
    confidence = 'low'
  }

  return { value, reasons: topReasons(reasons), confidence }
}

/**
 * Activation propensity (0-100) WITH its top drivers + confidence. PURE. The number is the
 * unchanged `activationPropensity(p)`; this names what is lifting (or flattening) it. An
 * already-activated member is a special, fully-confident case. Otherwise breadth (surfaces),
 * return frequency (active days), and sessions are the drivers, ordered by their contribution.
 */
export function explainActivationPropensity(p: PredictiveInputs): ScoreWithReasons<number> {
  const value = activationPropensity(p)
  if (p.activated) {
    return {
      value,
      reasons: [{ signal: 'activated', label: 'already did a first Practice', weight: 1 }],
      confidence: 'high',
    }
  }

  const reasons: ScoreReason[] = []
  if (p.interactionDays30 >= 3) reasons.push({ signal: 'active_days', label: 'returning often', weight: 0.8 })
  else if (p.interactionDays30 === 0) reasons.push({ signal: 'active_days', label: 'not returning yet', weight: 0.7 })
  if (p.surfaces30 >= 3) reasons.push({ signal: 'breadth', label: 'exploring several areas', weight: 0.6 })
  else if (p.surfaces30 <= 1) reasons.push({ signal: 'breadth', label: 'has only seen one corner', weight: 0.5 })
  if (p.sessions30 >= 3) reasons.push({ signal: 'sessions', label: 'visiting repeatedly', weight: 0.4 })
  if (p.tenureDays <= 14) reasons.push({ signal: 'tenure', label: 'still in their first two weeks', weight: 0.35 })
  if (reasons.length === 0) reasons.push({ signal: 'signal', label: 'too little signal to read yet', weight: 0.2 })

  // Confidence rises with the amount of early signal; a member with no days + no surfaces is thin.
  const signalCount = (p.interactionDays30 > 0 ? 1 : 0) + (p.surfaces30 > 0 ? 1 : 0) + (p.sessions30 > 0 ? 1 : 0)
  const confidence: ScoreConfidence = signalCount >= 2 ? 'high' : signalCount === 1 ? 'medium' : 'low'

  return { value, reasons: topReasons(reasons), confidence }
}

/**
 * Resonance Health (0-100) WITH its top drivers + confidence. PURE. The number is the unchanged
 * `resonanceHealth(p)`; this surfaces which of the four rolled-up signals carry it (or drag it).
 * Each driver's weight is its share of the score (the constant weight times its 0..1 contribution),
 * so the strongest contributor leads. Confidence is `high` when the inputs agree (all strong or all
 * weak), `low` when they conflict (e.g. deep engagement but high churn), `medium` otherwise.
 */
export function explainResonanceHealth(p: ResonanceHealthInputs): ScoreWithReasons<number> {
  const value = resonanceHealth(p)
  const depth = DEPTH_POINTS[p.engagementDepth] ?? 0
  const rfm = rfmNormalized(p.rfmScore)
  const wam = p.weeklyActive ? 1 : 0
  const churn = CHURN_DRAG[p.churnRisk] ?? 0

  const reasons: ScoreReason[] = [
    { signal: 'engagement_depth', label: DEPTH_LABEL[p.engagementDepth], weight: W_DEPTH * depth },
    { signal: 'recency_frequency', label: rfm >= 0.5 ? 'recent and frequent' : 'light recency and frequency', weight: W_RFM * rfm },
    { signal: 'weekly_active', label: wam ? 'weekly active' : 'not weekly active', weight: W_WAM * (wam ? 1 : 0.5) },
    {
      signal: 'churn_risk',
      label: p.churnRisk === 'low' ? 'low churn risk' : p.churnRisk === 'high' ? 'high churn risk' : 'some churn risk',
      weight: W_CHURN * (1 - churn),
    },
  ]

  // Conflict detection: deep engagement yet high churn (or vice versa) is a low-confidence read.
  const conflicted = (depth >= 0.67 && p.churnRisk === 'high') || (depth <= 0.34 && p.churnRisk === 'low')
  const allStrong = depth >= 0.67 && rfm >= 0.5 && p.churnRisk === 'low'
  const allWeak = depth <= 0.34 && rfm < 0.5 && p.churnRisk === 'high'
  const confidence: ScoreConfidence = conflicted ? 'low' : allStrong || allWeak ? 'high' : 'medium'

  return { value, reasons: topReasons(reasons), confidence }
}

/** All registry-governed computed traits for one member. */
export function computeTraits(stats: MemberStats, now: number): ComputedTrait[] {
  return [
    { key: 'join_cohort', type: 'string', value: isoWeek(stats.createdAt) },
    { key: 'activation_date', type: 'timestamp', value: stats.firstVerifiedPracticeAt },
    { key: 'last_active_at', type: 'timestamp', value: stats.lastEventAt },
    { key: 'days_active_30', type: 'number', value: stats.distinctActiveDays30 },
    { key: 'wam_status', type: 'boolean', value: stats.verifiedPractices7d >= 1 },
    { key: 'rfm_score', type: 'number', value: rfmScore(stats, now) },
    { key: 'lifecycle_stage', type: 'enum', value: lifecycleStage(stats, now) },
  ]
}

// ── Gamification fuel + retention signals (Resonance Engine Phase 5 · ADR-386) ────
// Two NEW pure functions, APPENDED beside the existing ones (never modifying a function
// above, so a sibling Phase 4 agent that also appends traits merges clean). Both feed the
// winback + dunning playbooks: `decline_slope` keys the winback (catch a slide before
// recency alone shows it), `notification_budget` lets the playbooks + send-gate respect a
// member's own crowding limit. PURE + unit-tested in lib/traits/decline-slope.test.ts.

/** Per-member practice counts in two trailing weekly buckets (the decline-slope input).
 *  Sourced nightly from practice_logs: this week = days 0 to 6, last week = days 7 to 13. */
export interface PracticeCadenceStats {
  /** Practice logs in the trailing 7 days (days 0 to 6). */
  practiceThisWeek: number
  /** Practice logs in the week before that (days 7 to 13). */
  practiceLastWeek: number
}

/**
 * Week-over-week DROP in practice frequency, as a fraction of last week, in [0, 1]. PURE +
 * deterministic. A POSITIVE slope means they are practicing LESS than last week (sliding);
 * 0 means flat or climbing. This is the leading reengagement signal: a member whose cadence
 * is falling shows here before plain recency catches them, so a winback fires in the window.
 *   - last week 0   -> 0 (no baseline to fall from; never divide by zero, never punish a
 *                       brand-new member who simply had no prior week).
 *   - this >= last  -> 0 (flat or climbing is not a decline).
 *   - else          -> (last - this) / last, clamped to [0, 1].
 * Counts are floored at 0 so a malformed negative can never push the slope out of range.
 */
export function declineSlope(s: PracticeCadenceStats): number {
  const last = Math.max(0, Math.floor(s.practiceLastWeek || 0))
  const thisWeek = Math.max(0, Math.floor(s.practiceThisWeek || 0))
  if (last === 0) return 0
  if (thisWeek >= last) return 0
  return Math.max(0, Math.min(1, (last - thisWeek) / last))
}

/** A member's own crowding limits, read from notification preferences (the notification-budget
 *  input). All optional: a member who set nothing reads as the `standard` budget. */
export interface NotificationBudgetInputs {
  /** Hard weekly send cap the member tolerates (0 = they want no outbound; undefined = no cap set). */
  weeklyCap?: number | null
  /** The member has quiet hours configured (a narrower window we may reach them). */
  quietHours?: boolean | null
  /** Their preferred channel, when set ('email' | 'push' | 'none' | …). 'none' means do not reach out. */
  preferredChannel?: string | null
  /** Email is on the hard suppression list (a bounce/complaint/manual block). */
  suppressed?: boolean | null
}

export type NotificationBudgetTier = 'generous' | 'standard' | 'sparing' | 'paused'

/**
 * Band a member's outreach budget into one of four tiers. PURE. FAIL-SAFE toward RESTRAINT:
 * any signal that the member wants less contact lowers the budget, and the strongest restraint
 * wins, so a playbook can never read a member as more reachable than they actually are.
 *   - `paused`   — suppressed, preferred channel 'none', or an explicit weekly cap of 0
 *                  (they have asked for no outbound; nothing fires).
 *   - `sparing`  — a low weekly cap (<= 1) OR quiet hours set (reach them lightly, off-hours-aware).
 *   - `generous` — a high weekly cap (>= 5) and no quiet-hours restraint (they tolerate more).
 *   - `standard` — everyone else (the default when nothing is set).
 */
export function notificationBudgetTier(p: NotificationBudgetInputs): NotificationBudgetTier {
  const channel = (p.preferredChannel ?? '').trim().toLowerCase()
  if (p.suppressed === true || channel === 'none') return 'paused'
  const cap = typeof p.weeklyCap === 'number' && Number.isFinite(p.weeklyCap) ? Math.floor(p.weeklyCap) : null
  if (cap !== null && cap <= 0) return 'paused'
  if ((cap !== null && cap <= 1) || p.quietHours === true) return 'sparing'
  if (cap !== null && cap >= 5) return 'generous'
  return 'standard'
}

/** The two Phase 5 retention traits for one member (decline slope + notification budget). */
export function computeRetentionTraits(
  cadence: PracticeCadenceStats,
  budget: NotificationBudgetInputs,
): ComputedTrait[] {
  return [
    { key: 'decline_slope', type: 'number', value: declineSlope(cadence) },
    { key: 'notification_budget', type: 'enum', value: notificationBudgetTier(budget) },
  ]
}
