// The per-practice depth streak (ADR-443, PRACTICE-DEPTH-BUILD §PD6-2).
//
// Distinct from lib/practice-streak.ts (the headline DAILY attendance streak — showing up is
// showing up). This is the "dig deeper" pull: consecutive days a member reached the tier they
// were after on a SINGLE practice — Standard or better, OR the personal target they set. It is
// pure recognition, economy-neutral (no Zaps, no zap_config, no writes): the reveal + the
// practice setup read it as flavor.
//
// DERIVED, no schema (§7): everything comes from `practice_logs` rows the caller already has —
// `logged_for` (the member-LOCAL calendar day the log was keyed under, so day bucketing is
// timezone-safe without any tz math here), `seconds_done`, and `seconds_target`. This module is
// kept pure (its own date helpers, no server imports) so it unit-tests without a database and the
// server-coupled lib/practice-streak.ts never leaks into the test graph.
//
// NAMING (docs/NAMING.md): "Depth" / "Deep" are RETIRED as member-facing nouns — this file names
// the CONCEPT (an internal build term) but every string it feeds a surface uses the live tier
// nouns (Light / Standard / Heavy) instead. The word never reaches a member.

import { achievedTier, tierRank, TIER_ORDER, TIER_LABELS, type AchievedOutcome } from './tiers'

/** One practice log, reduced to what the depth streak needs. */
export interface DepthLog {
  /** The member-local calendar day the log was keyed under (YYYY-MM-DD, practice_logs.logged_for). */
  day: string
  /** Engaged seconds the sit banked (practice_logs.seconds_done). */
  secondsDone: number
  /** The target seconds the sit aimed at (practice_logs.seconds_target). 0 / absent = no target. */
  secondsTarget: number
}

// --- pure date helpers (YYYY-MM-DD; the caller already bucketed logs into member-local days) ---

/** Shift a YYYY-MM-DD day by `delta` days, returning YYYY-MM-DD (UTC math on a pure date). */
export function shiftYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
}

/** Whole-day difference a − b. */
export function ymdDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000)
}

/** Cap the walk so a corrupt set can never loop unbounded. */
const WINDOW_DAYS = 400

/** The completion tolerance a timed sit hits its target at (mirrors logPractice's isFullSit ~95%,
 *  so a member who ends a beat early still counts as "hit their target"). */
const TARGET_TOLERANCE = 0.95

/**
 * Whether a log counts toward the depth streak: the member reached STANDARD or better, OR they
 * met the personal target they set (a met target is a solid day even on a gentle practice). Pure.
 * A partial / short sit under both bars does not count (it breaks the run, same as a missed day).
 */
export function isDepthHit(log: DepthLog): boolean {
  const done = Math.max(0, Math.round(log.secondsDone))
  const target = Math.max(0, Math.round(log.secondsTarget))
  const outcome = achievedTier(done)
  if (outcome !== 'partial' && tierRank(outcome) >= tierRank('standard')) return true
  if (target > 0 && done >= Math.round(target * TARGET_TOLERANCE)) return true
  return false
}

/**
 * Consecutive calendar days (ending today, or yesterday when today isn't in yet) on which the
 * member landed a depth-hit log for this practice. A day with no qualifying log breaks the run —
 * unlike the attendance streak, showing up short does NOT keep it. Pure + unit-tested.
 */
export function deriveDepthStreak(logs: DepthLog[], today: string): number {
  // The set of days that carried at least one depth hit (one log per practice per day in
  // practice, but fold defensively in case a caller passes more).
  const hitDays = new Set<string>()
  for (const log of logs) if (isDepthHit(log)) hitDays.add(log.day)

  let anchor: string
  if (hitDays.has(today)) anchor = today
  else if (hitDays.has(shiftYmd(today, -1))) anchor = shiftYmd(today, -1)
  else return 0

  let count = 0
  let cursor = anchor
  while (hitDays.has(cursor) && count <= WINDOW_DAYS) {
    count++
    cursor = shiftYmd(cursor, -1)
  }
  return count
}

/** The prior session summary the next-day "match it" nudge shows. */
export interface LastDepthSession {
  /** Engaged minutes, rounded (for "15 min"). */
  minutes: number
  /** The tier that session reached (or 'partial'); the nudge shows the tier noun, never a partial. */
  tier: AchievedOutcome
  /** The day it was logged (YYYY-MM-DD). */
  day: string
  /** True when that day was literally yesterday — so the nudge can honestly say "Yesterday" vs
   *  "Last time" (never claim yesterday for an older session; skeptic test, docs/CONTENT-VOICE). */
  wasYesterday: boolean
}

/**
 * The member's most recent PRIOR session for this practice (before today), for the "Yesterday:
 * 15 min · Heavy. Match it?" pull. Picks the latest day < today and its deepest log that day.
 * Returns null when there is no prior log. Pure + unit-tested.
 */
export function lastDepthSession(logs: DepthLog[], today: string): LastDepthSession | null {
  let best: DepthLog | null = null
  for (const log of logs) {
    if (ymdDiff(today, log.day) <= 0) continue // today or the future never counts as "last time"
    if (!best) {
      best = log
      continue
    }
    const cmp = ymdDiff(log.day, best.day)
    // A later day wins; on the same day the longer sit wins (the deepest that day).
    if (cmp > 0 || (cmp === 0 && log.secondsDone > best.secondsDone)) best = log
  }
  if (!best) return null
  const done = Math.max(0, Math.round(best.secondsDone))
  return {
    minutes: Math.max(0, Math.round(done / 60)),
    tier: achievedTier(done),
    day: best.day,
    wasYesterday: ymdDiff(today, best.day) === 1,
  }
}

/** The minutes a member adds to their last length to set a new personal best (the gentle "+2 min
 *  for a new best" pull). One rung of encouragement, never a contract. */
export const NEW_BEST_NUDGE_MIN = 2

/**
 * The remembered target for next time (the ratchet, PD3-2): the length the member actually reached
 * becomes tomorrow's default, and a personal best pulls it up rather than letting it drift down.
 * Pure so the "match it / new best" nudge and the persisted default agree. Never lowers a target
 * the member already reached — a shorter day keeps the higher bar in view (they can still adjust
 * down at the stepper any day). Returns whole seconds.
 */
export function nextTargetSeconds(prevTargetSec: number, achievedSec: number): number {
  const prev = Number.isFinite(prevTargetSec) ? Math.max(0, Math.round(prevTargetSec)) : 0
  const achieved = Number.isFinite(achievedSec) ? Math.max(0, Math.round(achievedSec)) : 0
  return Math.max(prev, achieved)
}

// --- member-facing copy (docs/CONTENT-VOICE.md + NAMING.md) --------------------------------
// One source for the "dig deeper" strings so the setup nudge and the reveal read identically.
// Voice: plain, specific, no narrated feelings, no em dashes. NAMING: never the retired "Deep" /
// "Depth" as a member noun — the tier nouns (Standard / Heavy) carry the recognition.

/** The next-day "match it" pull from the member's prior session: "Yesterday: 15 min · Heavy.
 *  Match it?" (or "Last time: ..." when the prior session was older than yesterday, so the line
 *  never claims a day it can't stand behind). A partial prior session drops the tier noun (there
 *  is no tier to name) and just offers the minutes to match. */
export function matchItLine(last: LastDepthSession): string {
  const when = last.wasYesterday ? 'Yesterday' : 'Last time'
  const tier = last.tier === 'partial' ? '' : ` · ${TIER_LABELS[last.tier]}`
  return `${when}: ${last.minutes} min${tier}. Match it?`
}

/** The gentle new-best pull that sits under the match-it line. */
export function newBestLine(): string {
  return `+${NEW_BEST_NUDGE_MIN} min for a new best.`
}

/** The depth-streak flavor line, or null below a run worth naming (a lone qualifying day is not
 *  yet a streak). "N days at Standard or better." — the live tier noun, never the retired "Deep".
 *  (A met personal target below Standard also keeps the run alive; the headline stays the strong,
 *  motivating tier phrasing.) */
export function depthStreakLine(days: number): string | null {
  if (!Number.isFinite(days) || days < 2) return null
  return `${Math.round(days)} days at Standard or better.`
}

/** The tier order re-exported for surfaces that render the ladder alongside a depth streak, so a
 *  caller need not import both modules. */
export { TIER_ORDER }
