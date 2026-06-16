// Seasons: first-class season identity + lifecycle. The heavy lifting (mint
// trophies, convert zaps->gems, reset counters/streaks/challenges, advance to the
// next season) lives in the reset_season() RPC; this module reads the current
// season and exposes a typed way to end it. Server-only.
//
// The seasons table is new; until `supabase gen types` is re-run it is not in the
// generated Database types, so this module uses an untyped admin handle. Drop the
// cast after regen (see docs/START-HERE.md).

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface Season {
  id: string
  season_number: number
  name: string
  theme: string | null
  starts_at: string
  ends_at: string | null
  status: 'upcoming' | 'active' | 'ended'
}

function db(): SupabaseClient {
  return createAdminClient()
}

export async function getCurrentSeason(): Promise<Season | null> {
  const { data } = await db()
    .from('seasons')
    .select('id, season_number, name, theme, starts_at, ends_at, status')
    .eq('status', 'active')
    .maybeSingle()
  return (data as Season | null) ?? null
}

/**
 * The next season already on the calendar (status 'upcoming'), soonest first, or
 * null when none is scheduled yet. Read-only and best-effort: the season-complete
 * "what's next" beat names it when it exists, and falls back to a plain "the next
 * Quest opens soon" line when it doesn't. No side effects.
 */
export async function getUpcomingSeason(): Promise<Season | null> {
  const { data } = await db()
    .from('seasons')
    .select('id, season_number, name, theme, starts_at, ends_at, status')
    .eq('status', 'upcoming')
    .order('starts_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data as Season | null) ?? null
}

/**
 * End the current season now: mints trophies, converts zaps to gems (rank-based),
 * resets seasonal counters / streaks / challenges, and opens the next season.
 * Destructive and global; callers must gate to admin (janitor).
 */
export async function endSeasonNow(): Promise<void> {
  await db().rpc('reset_season')
}

/** Summary of one auto-go-live sweep, returned to the cron for logging. */
export interface SeasonGoLiveResult {
  /** Scheduled seasons whose go-live time has arrived (status='scheduled', starts_at<=now). */
  scheduledDue: number
  /** Whether the earliest due season was promoted to Live this run (0 or 1). */
  promoted: number
  /** The id of the promoted season, when one was promoted. */
  promotedId: string | null
  /** True when a season was due but skipped because another season is still Live. */
  skippedBecauseActive: boolean
}

/**
 * Auto-go-live for Scheduled seasons. Promotes the earliest season whose go-live
 * time has arrived (status 'scheduled', starts_at <= now) to Live (stored 'active'),
 * but ONLY when no season is currently Live — the schema enforces at most one
 * 'active' season, and the prior season must be closed by the manual rollover first.
 *
 * Idempotent and side-effect-free beyond the single status flip: it does NOT touch
 * starts_at (already set when the season was scheduled) and does NOT run reset_season.
 * Promotes at most one season per call (the earliest due). Service-role only — runs
 * without a user session, so callers must come from a trusted context (the cron).
 *
 * @returns counts for the run; never throws on a "nothing due" / "skip" path.
 */
export async function promoteDueScheduledSeasons(): Promise<SeasonGoLiveResult> {
  const client = db()
  const now = new Date().toISOString()

  const result: SeasonGoLiveResult = {
    scheduledDue: 0,
    promoted: 0,
    promotedId: null,
    skippedBecauseActive: false,
  }

  // Earliest-first so the season that should have gone live soonest wins.
  const { data: due, error: dueError } = await client
    .from('seasons')
    .select('id, name, starts_at')
    .eq('status', 'scheduled')
    .lte('starts_at', now)
    .order('starts_at', { ascending: true })

  if (dueError) throw new Error(dueError.message)

  result.scheduledDue = due?.length ?? 0
  if (!due || due.length === 0) return result

  // One-active rule: only promote when nothing is currently Live. The partial unique
  // index is the backstop; this pre-check avoids a noisy constraint error and lets us
  // report the skip plainly. We don't auto-end the prior season (manual rollover only).
  const { data: live, error: liveError } = await client
    .from('seasons')
    .select('id')
    .eq('status', 'active')
    .maybeSingle()

  if (liveError) throw new Error(liveError.message)
  if (live) {
    result.skippedBecauseActive = true
    return result
  }

  const earliest = due[0] as { id: string }
  // Flip status only; starts_at is already the go-live time we matched on. Re-assert the
  // 'scheduled' precondition in the WHERE clause so a concurrent run can't double-promote.
  const { error: updateError } = await client
    .from('seasons')
    .update({ status: 'active' })
    .eq('id', earliest.id)
    .eq('status', 'scheduled')

  if (updateError) throw new Error(updateError.message)

  result.promoted = 1
  result.promotedId = earliest.id
  return result
}
