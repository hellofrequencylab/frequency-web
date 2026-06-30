// SPACE HEALTH — a PURE, framework-free classifier that sorts each Space into one of four health
// buckets from signals the admin list can gather cheaply (no Supabase/Next imports here, like
// lib/spaces/modes.ts and lib/pricing/plans.ts, so it is trivially unit-testable). The /admin/spaces
// dashboard gathers the signals in ONE batched pass (lib/spaces/health-signals.ts) and calls
// spaceHealth per Space to group the list by status.
//
// HONESTY NOTE: every signal here is something a janitor-gated admin read can source without an N+1.
//   - status: spaces.status (suspended / archived are operator states that obviously affect health).
//   - activeMembers / totalMembers: ONE grouped count over space_members per (space_id, status).
//   - lastActivityAt: the most-recent member join (max space_members.created_at), falling back to the
//     Space's own updated_at/created_at when it has no members yet. This is a coarse "is anything
//     happening here" proxy, not a true engagement metric — we do NOT pretend to measure more than we
//     can read cheaply, and unknown signals degrade rather than inventing data.
//
// COPY NOTE (CONTENT-VOICE §10): the `reasons` strings are operator-facing. Plain sentences, no em
// dashes, no hype, no narrated feelings. They state the fact behind the bucket so an operator knows
// what to look at.

import type { SpaceStatus } from './types'

/** The four health buckets, ordered MOST URGENT first (the order the dashboard renders sections in).
 *  - at_risk: a live Space that is shrinking, nearly empty, or otherwise needs a look soon.
 *  - needs_attention: a live Space with a smaller concern (low activity, a single member).
 *  - dormant: a live Space with no active members or no sign of activity in a long while.
 *  - healthy: a live Space with active members and recent activity.
 *  A suspended or archived Space is surfaced under at_risk / dormant respectively (operator states
 *  matter more than the member math). */
export type HealthBucket = 'at_risk' | 'needs_attention' | 'dormant' | 'healthy'

/** Buckets in render order, most urgent first. The dashboard iterates this to lay out its sections. */
export const HEALTH_BUCKETS: readonly HealthBucket[] = [
  'at_risk',
  'needs_attention',
  'dormant',
  'healthy',
] as const

/** Operator-facing label per bucket (plain voice, no em dashes). */
export const HEALTH_BUCKET_LABEL: Record<HealthBucket, string> = {
  at_risk: 'At risk',
  needs_attention: 'Needs attention',
  dormant: 'Dormant',
  healthy: 'Healthy',
}

/** The status-legend tone per bucket (the legend in docs/PRESENTATION.md: success/warning/danger).
 *  at_risk reads danger, needs_attention + dormant read warning, healthy reads success. Mirrors the
 *  StatusTone union in components/admin/status.tsx so the page can pass it straight to a StatusChip. */
export const HEALTH_BUCKET_TONE: Record<HealthBucket, 'success' | 'warning' | 'danger'> = {
  at_risk: 'danger',
  needs_attention: 'warning',
  dormant: 'warning',
  healthy: 'success',
}

/** The thresholds the classifier ranks on, named so the boundaries are documented in ONE place and the
 *  tests can reference the same numbers. Tuned conservatively: a Space only falls below "healthy" on a
 *  signal an operator would actually want to act on. */
export const HEALTH_THRESHOLDS = {
  /** A live Space with no activity in this many days reads as dormant (nothing is happening). */
  dormantDays: 90,
  /** A live Space whose newest activity is older than this (but newer than dormant) reads as
   *  needs_attention (going quiet, not yet dormant). */
  staleDays: 45,
  /** At or below this many active members, a live Space with some history reads as at_risk (nearly
   *  empty). One active member is fragile; zero is dormant (handled separately). */
  atRiskActiveMembers: 1,
  /** A live Space at or below this many active members (but above the at_risk floor) reads as
   *  needs_attention (small, worth a look). */
  lowActiveMembers: 3,
} as const

/** The cheaply-gatherable signals for one Space. Every member-derived field is OPTIONAL: a missing
 *  value means "could not be read" (the source was unmigrated or errored) and is treated as UNKNOWN,
 *  never as zero, so a degraded signal never manufactures a bad bucket. */
export interface SpaceHealthSignals {
  /** The Space's operator status (spaces.status). The strongest signal: suspended/archived dominate. */
  status: SpaceStatus
  /** Count of ACTIVE members (space_members.status = 'active'). Undefined = unknown (unreadable). */
  activeMembers?: number
  /** Count of ALL member rows of any status. Undefined = unknown. */
  totalMembers?: number
  /** ISO timestamp of the most recent sign of activity (newest member join, else the Space's own
   *  updated_at/created_at). Undefined/null = unknown. */
  lastActivityAt?: string | null
  /** "Now", injected so the classifier stays PURE + deterministic in tests. Defaults to Date.now(). */
  now?: number
}

/** The classifier's verdict: the bucket + the plain reasons behind it (for the row to display). */
export interface SpaceHealthResult {
  bucket: HealthBucket
  /** Plain operator-facing sentences explaining the bucket (CONTENT-VOICE). Always at least one. */
  reasons: string[]
}

/** Whole days between an ISO timestamp and `now`, or null when the timestamp is missing/unparseable
 *  (so the caller treats recency as unknown rather than guessing). */
function daysSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.floor((now - t) / 86_400_000)
}

/**
 * Classify a Space's health from its signals. PURE + total: any combination of signals (including all
 * unknown) yields a bucket and at least one reason. The order of checks IS the priority:
 *   1. Operator status wins: archived -> dormant; suspended -> at_risk.
 *   2. Then the member + recency math for a LIVE (active) Space:
 *      - zero active members, or no activity within `dormantDays` -> dormant.
 *      - at/below `atRiskActiveMembers` active (with some history) -> at_risk.
 *      - at/below `lowActiveMembers` active, or activity older than `staleDays` -> needs_attention.
 *      - otherwise -> healthy.
 * Unknown member counts are NOT read as zero: a Space we cannot count members for is judged on status +
 * recency alone, and lands healthy if nothing else flags it (we never punish a Space for a missing
 * signal).
 */
export function spaceHealth(signals: SpaceHealthSignals): SpaceHealthResult {
  const now = signals.now ?? Date.now()
  const T = HEALTH_THRESHOLDS

  // 1. Operator status dominates the member math.
  if (signals.status === 'archived') {
    return { bucket: 'dormant', reasons: ['Archived. Kept for history, not serving members.'] }
  }
  if (signals.status === 'suspended') {
    return { bucket: 'at_risk', reasons: ['Suspended. Members cannot reach this Space right now.'] }
  }

  // 2. A live (active) Space: judge on members + recency.
  const reasons: string[] = []
  const active = signals.activeMembers
  const total = signals.totalMembers
  const idleDays = daysSince(signals.lastActivityAt, now)
  const activeKnown = typeof active === 'number'
  const hasHistory = typeof total === 'number' ? total > 0 : false

  // ── Dormant: nobody active, or nothing has happened in a long time ──────────────────────────────
  if (activeKnown && active === 0) {
    if (hasHistory) {
      reasons.push('No active members. Everyone here has left or gone quiet.')
    } else {
      reasons.push('No members yet. Nobody has joined this Space.')
    }
    if (idleDays !== null && idleDays >= T.dormantDays) {
      reasons.push(`No activity in ${idleDays} days.`)
    }
    return { bucket: 'dormant', reasons }
  }
  if (idleDays !== null && idleDays >= T.dormantDays) {
    reasons.push(`No activity in ${idleDays} days.`)
    if (activeKnown) reasons.push(memberLine(active!, total))
    return { bucket: 'dormant', reasons }
  }

  // ── At risk: a live Space down to its last active member ────────────────────────────────────────
  if (activeKnown && active! <= T.atRiskActiveMembers && hasHistory) {
    reasons.push(`Down to ${active} active ${plural(active!, 'member', 'members')}. Easy to lose.`)
    if (idleDays !== null) reasons.push(activityLine(idleDays))
    return { bucket: 'at_risk', reasons }
  }

  // ── Needs attention: small, or going quiet ──────────────────────────────────────────────────────
  if (activeKnown && active! <= T.lowActiveMembers) {
    reasons.push(`${memberLine(active!, total)}. Worth a look.`)
    if (idleDays !== null && idleDays >= T.staleDays) reasons.push(activityLine(idleDays))
    return { bucket: 'needs_attention', reasons }
  }
  if (idleDays !== null && idleDays >= T.staleDays) {
    reasons.push(activityLine(idleDays))
    if (activeKnown) reasons.push(memberLine(active!, total))
    return { bucket: 'needs_attention', reasons }
  }

  // ── Healthy: active members and recent activity (or no flags on an unknown-count Space) ──────────
  if (activeKnown) {
    reasons.push(`${memberLine(active!, total)}.`)
  } else {
    reasons.push('Active and steady.')
  }
  if (idleDays !== null && idleDays >= 0) reasons.push(activityLine(idleDays))
  return { bucket: 'healthy', reasons }
}

/** A plain "N active / M total members" line. Drops the total when it is unknown or equal to active. */
function memberLine(active: number, total: number | undefined): string {
  if (typeof total === 'number' && total > active) {
    return `${active} active of ${total} ${plural(total, 'member', 'members')}`
  }
  return `${active} active ${plural(active, 'member', 'members')}`
}

/** A plain recency line. "Active today" for fresh, else "Last activity N days ago". */
function activityLine(idleDays: number): string {
  if (idleDays <= 0) return 'Active today.'
  if (idleDays === 1) return 'Last activity 1 day ago.'
  return `Last activity ${idleDays} days ago.`
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}
