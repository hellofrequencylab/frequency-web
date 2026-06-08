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
