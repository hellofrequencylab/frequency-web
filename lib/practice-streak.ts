// The daily practice streak — the headline streak a member feels.
//
// Unlike the weekly attendance/posting/hosting streaks (lib/achievements.ts +
// the `streaks` table), this is a Duolingo-style *daily* streak: consecutive
// calendar days on which the member logged at least one practice. It is the
// number the home feed, profile flair and `profiles.current_streak` show.
//
// Design (ADR-145, extended by the bounded-forgiveness redesign):
//  - The raw count is DERIVED from `practice_logs.logged_for` (UTC dates), so it
//    is always correct for any member with history — no backfill, no cron.
//  - `profiles.meta.practiceStreak` augments that with the things logs can't
//    express: the banked reserve (freeze tokens), which missed days the reserve
//    has bridged, an optional member-set rest window, and which milestones have
//    already paid out (exactly-once rewards).
//  - A "day" is the UTC date, matching how lib/practices.ts writes
//    `practice_logs.logged_for` — one shared day boundary across the system.
//
// Bounded forgiveness (the audience-research redesign — never shame a slip):
//  - The **reserve** is the banked freeze tokens, surfaced as a small safety net
//    of 1–2 grace days. It auto-bridges a single slip the next time the member
//    logs, so a missed day never zeroes the streak. "Never miss twice": two
//    missed days in a row is the gentle reset, not a punishment.
//  - The **rest window** ("life happens" pause) lets a member mark a planned
//    break. Days inside an active pause are treated as covered (folded into the
//    frozen set on read AND on the next log), so a planned break is not a miss.
//    The window is bounded by MAX_PAUSE_DAYS and stored in the same jsonb meta —
//    no migration, no new table.

import { createAdminClient } from '@/lib/supabase/admin'
import { awardZaps } from '@/lib/zaps'
import { STREAK_MILESTONES, STREAK_FREEZE_CAP, FULL_DAYS_PER_FREEZE, streakProgress } from '@/lib/streak'
import { postSystemLine } from '@/lib/system-line'
import type { Json } from '@/lib/database.types'

// How far back to read logs / keep frozen-day records. A streak longer than this
// is vanishingly rare and still displays via the cached `longest`.
const WINDOW_DAYS = 400

/** Longest a single rest window may run. A safety net with no ceiling stops being
 *  a safety net, so a planned break is bounded: rest up to two weeks and the
 *  streak rests with you, then it starts fresh on the day you pick it back up. */
export const MAX_PAUSE_DAYS = 14

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

// --- rest window ("life happens" pause) -----------------------------------

export interface RestWindow {
  /** First UTC day of the planned break (YYYY-MM-DD). */
  from: string
  /** Last UTC day of the planned break, inclusive (YYYY-MM-DD). */
  through: string
}

/**
 * Expand a rest window into the set of UTC days it covers, clamped to the days
 * up to and including `today` (a future break covers nothing yet) and to
 * MAX_PAUSE_DAYS so a malformed window can never freeze an unbounded span. Pure +
 * unit-tested. These days fold into the frozen set so a planned break is bridged,
 * exactly like a reserve-bridged day — no miss, no reset.
 */
export function pauseCoveredDays(rest: RestWindow | null | undefined, today: string): string[] {
  if (!rest) return []
  const start = rest.from
  // Never cover the future: a break only protects days that have actually passed.
  const end = dayDiff(rest.through, today) > 0 ? today : rest.through
  if (dayDiff(end, start) < 0) return []
  const days: string[] = []
  let cursor = start
  let guard = 0
  while (dayDiff(end, cursor) >= 0 && guard < MAX_PAUSE_DAYS) {
    days.push(cursor)
    cursor = shiftDay(cursor, 1)
    guard++
  }
  return days
}

/** True when `today` falls inside the rest window (the member is resting now). */
export function isResting(rest: RestWindow | null | undefined, today: string): boolean {
  if (!rest) return false
  return dayDiff(today, rest.from) >= 0 && dayDiff(rest.through, today) >= 0
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
  /** Member-set "life happens" rest window. Days inside it are treated as covered
   *  so a planned break is not a miss. Bounded by MAX_PAUSE_DAYS. Migration-free:
   *  it lives in the same jsonb meta as the rest of the streak augmentation. */
  rest?: RestWindow | null
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
    rest: ps.rest ?? null,
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
  /** The reserve would bridge today if missed (never-miss-twice safety net). */
  willFreezeProtect: boolean
  /** Banked reserve: grace days that auto-bridge a slip. Capped at STREAK_FREEZE_CAP. */
  freezeTokens: number
  /** Most reserve a member can bank at once (the safety net's ceiling). */
  reserveCap: number
  /** A reserve day has bridged a slip inside the current run (it held). */
  reserveHeld: boolean
  /** The member has marked a planned rest right now (the "life happens" pause). */
  resting: boolean
  /** The active rest window, if any (so the UI can name when it ends). */
  rest: RestWindow | null
  status: 'none' | 'logged_today' | 'at_risk' | 'broken' | 'resting'
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
  // The frozen set bridges gaps two ways: reserve days already spent, and the days
  // an active rest window covers (a planned break is not a miss).
  const frozen = new Set(stored.frozenDates)
  const pauseDays = pauseCoveredDays(stored.rest, today)
  for (const d of pauseDays) frozen.add(d)

  const { current, loggedToday, alive } = derivePracticeStreak(logged, frozen, today)
  const longest = Math.max(stored.longest, current)
  const resting = isResting(stored.rest, today)
  // At risk only when alive, unlogged, AND not resting — resting is calm, not a warning.
  const atRisk = alive && !loggedToday && !resting
  const prog = streakProgress(current)

  // Did a reserve day bridge a slip inside the current run? (Distinct from a paused
  // day — that's a planned rest, not a reserve spend.) Walk the run; a frozen day
  // that wasn't part of the pause means the reserve held.
  let reserveHeld = false
  if (alive) {
    const pauseSet = new Set(pauseDays)
    let cursor = loggedToday ? today : shiftDay(today, -1)
    let steps = 0
    while ((logged.has(cursor) || frozen.has(cursor)) && steps <= WINDOW_DAYS) {
      if (!logged.has(cursor) && frozen.has(cursor) && !pauseSet.has(cursor)) {
        reserveHeld = true
        break
      }
      cursor = shiftDay(cursor, -1)
      steps++
    }
  }

  const status: PracticeStreakState['status'] = resting
    ? 'resting'
    : !alive
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
    reserveCap: STREAK_FREEZE_CAP,
    reserveHeld,
    resting,
    rest: stored.rest ?? null,
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

  // A planned rest window covers its days for free (no reserve spend). Fold those
  // days into the frozen set first, so logging on the day a member picks it back
  // up bridges the break and the streak survives. The covered days persist (they
  // become permanent frozen records, pruned by the same window as reserve days).
  for (const d of pauseCoveredDays(stored.rest, today)) frozen.add(d)

  // Reserve consumption: if yesterday is missing and the last logged/covered day
  // before today was exactly the day before yesterday (a single-day gap), spend a
  // reserve day to bridge yesterday so momentum survives one slip.
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
  let topMilestone: number | null = null
  for (const m of STREAK_MILESTONES) {
    if (current >= m.day && !paid.has(m.day)) {
      paid.add(m.day)
      topMilestone = m.day
      if (m.zaps > 0) {
        await awardZaps(profileId, m.zaps, {
          actionType: 'streak_milestone',
          metadata: { day: m.day },
        }).catch(() => {})
      }
      if (m.freeze) banked++
    }
  }
  // Vera marks the moment in the feed (ADR-239) — one quiet line for the
  // highest checkpoint just crossed, same once-ever gate as the payout.
  if (topMilestone !== null) {
    const { data: who } = await admin
      .from('profiles')
      .select('handle')
      .eq('id', profileId)
      .maybeSingle()
    const handle = (who as { handle: string | null } | null)?.handle
    if (handle) await postSystemLine(`@${handle} hit a ${topMilestone} day streak 🔥`)
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

  // Once a rest window is fully in the past, retire it. Its covered days already
  // live in frozenDates (added above), so the streak keeps its bridge; dropping
  // the window just stops it lingering as "resting" state.
  const restStillRelevant = stored.rest && dayDiff(today, stored.rest.through) <= 0
  const nextRest = restStillRelevant ? stored.rest ?? null : null

  const nextMeta = {
    ...meta,
    practiceStreak: {
      freezeTokens,
      frozenDates: prunedFrozen,
      milestonesPaid: [...paid].sort((a, b) => a - b),
      longest,
      fullDayFreezesApplied: fullDayApplied,
      rest: nextRest,
      current,
      lastDay: today,
      updatedAt: new Date().toISOString(),
    } satisfies StoredStreak,
  }

  // Write through an untyped handle: `meta` is jsonb and the current_streak /
  // longest_streak columns are the headline mirror (cast pattern per
  // lib/practices.ts / feed/page.tsx). The nested RestWindow is a named type, so
  // it is widened to Json for the jsonb column.
  await (admin)
    .from('profiles')
    .update({ meta: nextMeta as unknown as Json, current_streak: current, longest_streak: longest })
    .eq('id', profileId)
}

// --- un-log recompute (today-only; WEBSITE-CHANGES-PLAN §3 B.1 / D4) --------

/**
 * Re-derive the daily practice streak AFTER today's log has been deleted (the
 * today-only un-log path, lib/practices.unlogPractice). This is the safe, dedicated
 * counterpart to `recordPracticeStreak`: it NEVER re-runs the monotonic forward
 * writer (which spends freezes + pays milestones permanently). It only recomputes
 * the DISPLAYED count from the remaining logs and mirrors it to
 * `profiles.current_streak`.
 *
 * Today-only scope keeps this trivial and lossless:
 *   • The reserve (`freezeTokens`) and the bridged days (`frozenDates`) are LEFT
 *     UNTOUCHED. A freeze spent to bridge a PAST slip reflects real history (the
 *     member did miss that day); removing today's log never un-bridges it. So a
 *     re-log later finds the same reserve + bridges it found before — no drift.
 *   • Paid milestones (`milestonesPaid`) are LEFT UNTOUCHED. They are exactly-once
 *     reward records; we never refund or re-pay them, so re-logging today can never
 *     double-pay a milestone it already paid.
 *   • `longest` is preserved as a high-water mark (a banked record never lowers),
 *     consistent with the forward writer's GREATEST semantics.
 *
 * The result: after un-logging today, the streak shows exactly what it would have
 * shown had today never been logged, with no economy side effects to reverse.
 * Idempotent — calling it again (today already absent) is a no-op for the count.
 */
export async function recomputePracticeStreakAfterUnlog(profileId: string): Promise<void> {
  const admin = createAdminClient()
  const today = todayUTC()

  const { data: prof } = await admin.from('profiles').select('meta').eq('id', profileId).maybeSingle()
  const meta = (prof?.meta ?? {}) as Record<string, unknown>
  const stored = readStored(meta)

  const { data: rows } = await admin
    .from('practice_logs')
    .select('logged_for')
    .eq('profile_id', profileId)
    .gte('logged_for', shiftDay(today, -WINDOW_DAYS))
  // The just-deleted today row may still be visible to a racing read — drop it
  // explicitly so the recompute reflects the post-un-log world.
  const logged = new Set((rows ?? []).map((r) => String((r as { logged_for: string }).logged_for)))
  logged.delete(today)

  // Bridge with the SAME frozen set the read path uses (banked reserve days + any
  // active rest window's covered days). We do not add to or spend from it here.
  const frozen = new Set(stored.frozenDates)
  for (const d of pauseCoveredDays(stored.rest, today)) frozen.add(d)

  const { current } = derivePracticeStreak(logged, frozen, today)
  const longest = Math.max(stored.longest, current) // never lower a banked record

  const nextMeta = {
    ...meta,
    practiceStreak: {
      freezeTokens: stored.freezeTokens,
      frozenDates: stored.frozenDates,
      milestonesPaid: stored.milestonesPaid,
      longest,
      fullDayFreezesApplied: stored.fullDayFreezesApplied ?? 0,
      rest: stored.rest ?? null,
      current,
      lastDay: today,
      updatedAt: new Date().toISOString(),
    } satisfies StoredStreak,
  }

  await admin
    .from('profiles')
    .update({ meta: nextMeta as unknown as Json, current_streak: current, longest_streak: longest })
    .eq('id', profileId)
}

// --- buy-a-freeze sink (Rewards Economy v3, ADR-305) -----------------------

export interface GrantFreezeResult {
  /** A freeze token was banked. */
  granted: boolean
  /** The freeze reserve after the call. */
  freezeTokens: number
  /** True when the grant was refused because the member is already at the cap. */
  atCap: boolean
}

/**
 * Bank ONE daily-streak freeze token for a member (the Vault "buy a streak freeze"
 * sink, ADR-305 / REWARDS-ECONOMY.md §8–§9). The reserve lives in
 * `profiles.meta.practiceStreak.freezeTokens`, the same slot the earned freezes use
 * (lib/streak earn paths), and is capped at STREAK_FREEZE_CAP — a member already at the
 * cap is refused (`atCap: true`, `granted: false`) so the store can refund / not charge.
 * Idempotency / charge is the store's job (the store_redemptions row debits the Gems);
 * this just moves the reserve. Service-role path.
 *
 * NOTE: the "Freezes are never purchasable" note in lib/streak predates ADR-305, which
 * adds buying one with Gems as an explicit second sink. The cap still holds for both
 * the earned and the bought freeze, so buying can never exceed STREAK_FREEZE_CAP.
 */
export async function grantStreakFreeze(profileId: string): Promise<GrantFreezeResult> {
  const admin = createAdminClient()

  const { data: prof } = await admin.from('profiles').select('meta').eq('id', profileId).maybeSingle()
  const meta = (prof?.meta ?? {}) as Record<string, unknown>
  const stored = readStored(meta)

  if (stored.freezeTokens >= STREAK_FREEZE_CAP) {
    return { granted: false, freezeTokens: stored.freezeTokens, atCap: true }
  }

  const freezeTokens = Math.min(STREAK_FREEZE_CAP, stored.freezeTokens + 1)

  const nextMeta = {
    ...meta,
    practiceStreak: {
      ...(meta.practiceStreak as Record<string, unknown> | undefined),
      freezeTokens,
      frozenDates: stored.frozenDates,
      milestonesPaid: stored.milestonesPaid,
      longest: stored.longest,
      fullDayFreezesApplied: stored.fullDayFreezesApplied ?? 0,
      rest: stored.rest ?? null,
      updatedAt: new Date().toISOString(),
    } satisfies StoredStreak,
  }

  await admin.from('profiles').update({ meta: nextMeta as unknown as Json }).eq('id', profileId)
  return { granted: true, freezeTokens, atCap: false }
}

// --- rest-window writers (the "life happens" pause) ------------------------

export interface SetPauseResult {
  rest: RestWindow
}

/**
 * Mark a member resting for `days` starting today (the "life happens" pause).
 * Service-role path, called only from the server action that resolves profileId
 * from the session. Bounded by MAX_PAUSE_DAYS so the safety net keeps a ceiling.
 * Migration-free: the window is stored in `profiles.meta.practiceStreak.rest`
 * alongside the rest of the streak augmentation. Setting a new window replaces
 * any existing one. Idempotent-safe — re-marking just resets the window.
 */
export async function setStreakPause(profileId: string, days: number): Promise<SetPauseResult> {
  const admin = createAdminClient()
  const today = todayUTC()
  const span = Math.max(1, Math.min(MAX_PAUSE_DAYS, Math.floor(days || 0)))
  const rest: RestWindow = { from: today, through: shiftDay(today, span - 1) }

  const { data: prof } = await admin.from('profiles').select('meta').eq('id', profileId).maybeSingle()
  const meta = (prof?.meta ?? {}) as Record<string, unknown>
  const stored = readStored(meta)

  const nextMeta = {
    ...meta,
    practiceStreak: {
      ...meta.practiceStreak as Record<string, unknown> | undefined,
      freezeTokens: stored.freezeTokens,
      frozenDates: stored.frozenDates,
      milestonesPaid: stored.milestonesPaid,
      longest: stored.longest,
      fullDayFreezesApplied: stored.fullDayFreezesApplied ?? 0,
      rest,
      updatedAt: new Date().toISOString(),
    } satisfies StoredStreak,
  }

  await (admin).from('profiles').update({ meta: nextMeta as unknown as Json }).eq('id', profileId)
  return { rest }
}

/**
 * End an active rest window early. The days the window already covered keep
 * bridging the streak (they're folded into frozenDates on the next log / read),
 * so ending a rest never costs the member their progress. Service-role path.
 */
export async function clearStreakPause(profileId: string): Promise<void> {
  const admin = createAdminClient()
  const today = todayUTC()

  const { data: prof } = await admin.from('profiles').select('meta').eq('id', profileId).maybeSingle()
  const meta = (prof?.meta ?? {}) as Record<string, unknown>
  const stored = readStored(meta)
  if (!stored.rest) return

  // Bank the already-covered days as permanent frozen records before dropping the
  // window, so ending early keeps the bridge the rest had been providing.
  const frozen = new Set(stored.frozenDates)
  for (const d of pauseCoveredDays(stored.rest, today)) frozen.add(d)
  const prunedFrozen = [...frozen].filter((d) => dayDiff(today, d) <= WINDOW_DAYS)

  const nextMeta = {
    ...meta,
    practiceStreak: {
      ...meta.practiceStreak as Record<string, unknown> | undefined,
      freezeTokens: stored.freezeTokens,
      frozenDates: prunedFrozen,
      milestonesPaid: stored.milestonesPaid,
      longest: stored.longest,
      fullDayFreezesApplied: stored.fullDayFreezesApplied ?? 0,
      rest: null,
      updatedAt: new Date().toISOString(),
    } satisfies StoredStreak,
  }

  await (admin).from('profiles').update({ meta: nextMeta as unknown as Json }).eq('id', profileId)
}
