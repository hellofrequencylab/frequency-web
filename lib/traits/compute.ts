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
