// The daily practice streak — the headline streak a member feels.
//
// Unlike the weekly attendance/posting/hosting streaks (lib/achievements.ts +
// the `streaks` table), this is a Duolingo-style *daily* streak: consecutive
// calendar days on which the member logged at least one practice. It is the
// number the home feed, profile flair and `profiles.current_streak` show.
//
// Design (ADR-145):
//  - The raw count is DERIVED from `practice_logs.logged_for` (UTC dates), so it
//    is always correct for any member with history — no backfill, no cron.
//  - `profiles.meta.practiceStreak` augments that with the things logs can't
//    express: banked freeze tokens, which missed days a freeze has bridged, and
//    which milestones have already paid out (exactly-once rewards).
//  - A "day" is the UTC date, matching how lib/practices.ts writes
//    `practice_logs.logged_for` — one shared day boundary across the system.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { awardZaps } from '@/lib/zaps'
import { STREAK_MILESTONES, STREAK_FREEZE_CAP, FULL_DAYS_PER_FREEZE, streakProgress } from '@/lib/streak'

// How far back to read logs / keep frozen-day records. A streak longer than this
// is vanishingly rare and still displays via the cached `longest`.
const WINDOW_DAYS = 400

// --- pure date helpers (UTC "YYYY-MM-DD") ---------------------------------

/** Today's UTC date as YYYY-MM-DD (matches practice_logs.logged_for). */
export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Shift a YYYY-MM-DD date by `delta` days (UTC), returning YYYY-MM-DD. */
export function shiftDay(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
}

/** Whole-day difference a − b (UTC). */
export function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000)
}

// --- the pure deriver ------------------------------------------------------

export interface DerivedStreak {
  /** Consecutive-day count ending today (if logged) or yesterday (at risk). */
  current: number
  /** A practice was logged today. */
  loggedToday: boolean
  /** The streak is still alive (today or yesterday is covered). */
  alive: boolean
}

/**
 * Count the consecutive-day streak from a set of logged days, with `frozen` days
 * bridging gaps. Pure + unit-tested. The streak is alive iff today or yesterday
 * is covered; it then walks back day-by-day while each day is logged or frozen.
 */
export function derivePracticeStreak(
  logged: Set<string>,
  frozen: Set<string>,
  today: string,
): DerivedStreak {
  const present = (d: string) => logged.has(d) || frozen.has(d)
  const loggedToday = logged.has(today)

  let anchor: string
  if (loggedToday) anchor = today
  else if (present(shiftDay(today, -1))) anchor = shiftDay(today, -1)
  else return { current: 0, loggedToday: false, alive: false }

  let count = 0
  let cursor = anchor
  // Cap the walk so a corrupt set can never loop unbounded.
  while (present(cursor) && count <= WINDOW_DAYS) {
    count++
    cursor = shiftDay(cursor, -1)
  }
  return { current: count, loggedToday, alive: true }
}

// --- stored augmentation shape --------------------------------------------

interface StoredStreak {
  freezeTokens: number
  frozenDates: string[]
  milestonesPaid: number[]
  longest: number
  /** Freezes already minted from the Full-Day path (every FULL_DAYS_PER_FREEZE
   *  Full Day bonuses = 1 freeze credit; unapplied credits bank until below cap). */
  fullDayFreezesApplied?: number
  current?: number
  lastDay?: string | null
  updatedAt?: string
}

function readStored(meta: Record<string, unknown> | null | undefined): StoredStreak {
  const ps = (meta?.practiceStreak ?? {}) as Partial<StoredStreak>
  return {
    freezeTokens: ps.freezeTokens ?? 0,
    frozenDates: ps.frozenDates ?? [],
    milestonesPaid: ps.milestonesPaid ?? [],
    longest: ps.longest ?? 0,
    fullDayFreezesApplied: ps.fullDayFreezesApplied ?? 0,
  }
}

// --- read path -------------------------------------------------------------

export interface PracticeStreakState {
  /** Effective current streak as of now (0 when broken). */
  current: number
  longest: number
  loggedToday: boolean
  /** Alive but today isn't logged yet — log to keep it. */
  atRisk: boolean
  /** A banked freeze would absorb today if missed. */
  willFreezeProtect: boolean
  freezeTokens: number
  status: 'none' | 'logged_today' | 'at_risk' | 'broken'
  /** Next milestone to chase (null once every checkpoint is reached). */
  nextMilestone: { day: number; label: string } | null
  /** Days remaining to the next milestone. */
  toNext: number
}

/** A member's live daily practice streak. Pure read — never writes. */
export async function getPracticeStreak(profileId: string): Promise<PracticeStreakState> {
  const admin = createAdminClient()
  const today = todayUTC()

  const [{ data: prof }, { data: rows }] = await Promise.all([
    admin.from('profiles').select('meta').eq('id', profileId).maybeSingle(),
    admin
      .from('practice_logs')
      .select('logged_for')
      .eq('profile_id', profileId)
      .gte('logged_for', shiftDay(today, -WINDOW_DAYS)),
  ])

  const stored = readStored(prof?.meta as Record<string, unknown> | null)
  const logged = new Set((rows ?? []).map((r) => String((r as { logged_for: string }).logged_for)))
  const frozen = new Set(stored.frozenDates)

  const { current, loggedToday, alive } = derivePracticeStreak(logged, frozen, today)
  const longest = Math.max(stored.longest, current)
  const atRisk = alive && !loggedToday
  const prog = streakProgress(current)

  const status: PracticeStreakState['status'] = !alive
    ? current === 0 && longest === 0
      ? 'none'
      : 'broken'
    : loggedToday
      ? 'logged_today'
      : 'at_risk'

  return {
    current,
    longest,
    loggedToday,
    atRisk,
    willFreezeProtect: atRisk && stored.freezeTokens > 0,
    freezeTokens: stored.freezeTokens,
    status,
    nextMilestone: prog.next ? { day: prog.next.day, label: prog.next.label } : null,
    toNext: prog.toNext,
  }
}

// --- write path (called once per practice log) -----------------------------

/**
 * Advance the daily practice streak after a practice has been logged for today.
 * Idempotent per day (a second practice the same day is a no-op for the count).
 * Consumes a freeze token to bridge a single missed day, pays first-time
 * milestone rewards (zaps + banked freezes), and mirrors the result to
 * `profiles.current_streak` / `longest_streak`.
 */
export async function recordPracticeStreak(profileId: string): Promise<void> {
  const admin = createAdminClient()
  const today = todayUTC()

  const { data: prof } = await admin.from('profiles').select('meta').eq('id', profileId).maybeSingle()
  const meta = (prof?.meta ?? {}) as Record<string, unknown>
  const stored = readStored(meta)
  let freezeTokens = stored.freezeTokens
  const frozen = new Set(stored.frozenDates)
  const paid = new Set(stored.milestonesPaid)
  let longest = stored.longest

  const { data: rows } = await admin
    .from('practice_logs')
    .select('logged_for')
    .eq('profile_id', profileId)
    .gte('logged_for', shiftDay(today, -WINDOW_DAYS))
  const logged = new Set((rows ?? []).map((r) => String((r as { logged_for: string }).logged_for)))
  logged.add(today) // the just-written log, even if the read raced it

  // Freeze consumption: if yesterday is missing and the last logged day before
  // today was exactly the day before yesterday (a single-day gap), spend a token
  // to bridge yesterday so momentum survives one slip.
  const yesterday = shiftDay(today, -1)
  if (!logged.has(yesterday) && !frozen.has(yesterday) && freezeTokens > 0) {
    let prev = shiftDay(today, -2)
    let scanned = 0
    while (scanned < WINDOW_DAYS && !logged.has(prev)) {
      prev = shiftDay(prev, -1)
      scanned++
    }
    if (logged.has(prev) && dayDiff(today, prev) === 2) {
      frozen.add(yesterday)
      freezeTokens -= 1
    }
  }

  const { current } = derivePracticeStreak(logged, frozen, today)
  longest = Math.max(longest, current)

  // First-time milestone rewards. `current` only ever climbs by 1 per day, so
  // gating on "not yet paid" pays each checkpoint exactly once, ever.
  let banked = 0
  for (const m of STREAK_MILESTONES) {
    if (current >= m.day && !paid.has(m.day)) {
      paid.add(m.day)
      if (m.zaps > 0) {
        await awardZaps(profileId, m.zaps, {
          actionType: 'streak_milestone',
          metadata: { day: m.day },
        }).catch(() => {})
      }
      if (m.freeze) banked++
    }
  }
  freezeTokens = Math.min(STREAK_FREEZE_CAP, freezeTokens + banked)

  // Second earn path (Rewards Economy v2): every FULL_DAYS_PER_FREEZE Full Day
  // bonuses earned = 1 freeze credit. Credits already minted are tracked in
  // fullDayFreezesApplied; unapplied credits bank until a slot opens below the
  // cap. Freezes are never purchasable.
  let fullDayApplied = stored.fullDayFreezesApplied ?? 0
  try {
    const { count } = await admin
      .from('reward_grants')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profileId)
      .like('rule_key', 'journey.fullday:%')
    const earnedCredits = Math.floor((count ?? 0) / FULL_DAYS_PER_FREEZE)
    while (fullDayApplied < earnedCredits && freezeTokens < STREAK_FREEZE_CAP) {
      freezeTokens++
      fullDayApplied++
    }
  } catch {
    // the freeze credit read is best-effort; credits stay banked for next time
  }

  const prunedFrozen = [...frozen].filter((d) => dayDiff(today, d) <= WINDOW_DAYS)

  const nextMeta = {
    ...meta,
    practiceStreak: {
      freezeTokens,
      frozenDates: prunedFrozen,
      milestonesPaid: [...paid].sort((a, b) => a - b),
      longest,
      fullDayFreezesApplied: fullDayApplied,
      current,
      lastDay: today,
      updatedAt: new Date().toISOString(),
    } satisfies StoredStreak,
  }

  // Write through an untyped handle: `meta` is jsonb and the current_streak /
  // longest_streak columns are the headline mirror (cast pattern per
  // lib/practices.ts / feed/page.tsx).
  await (admin as unknown as SupabaseClient)
    .from('profiles')
    .update({ meta: nextMeta, current_streak: current, longest_streak: longest })
    .eq('id', profileId)
}
