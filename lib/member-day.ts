// The member's "today" — a tz-aware calendar day (YYYY-MM-DD).
//
// A practice "day" is the unit the whole logging loop turns on: the
// `engagement_events` idempotency key, the `practice_logs.logged_for` unique
// constraint, and the "Log practice" buttons all key off it. Computing that day
// in UTC means the server's day rolls over at UTC midnight, which for a Pacific
// member is ~4-5pm local: their already-logged practices spring back to an
// un-logged button hours before THEIR midnight. This helper resolves the day in
// the member's own IANA timezone instead, so a day flips only at the member's
// local midnight.
//
// Server-resolved by design (the caller reads profiles.home_timezone, never the
// client) so the idempotency key + unique constraint can't be spoofed to backdate
// a log. A member can only ever shift their OWN local day, never an arbitrary one;
// the daily cap, once-per-practice-per-day, and the on-air timer proof are all
// untouched — only the day STRING is now tz-aware.

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The calendar day (YYYY-MM-DD) for "now" in the given IANA timezone. Uses the
 * en-CA locale, whose date format IS ISO `YYYY-MM-DD`, so no reformatting is
 * needed. An invalid or null timezone falls back to UTC rather than throwing, so
 * a bad stored/client tz can never break a log (it just behaves as today's UTC).
 */
export function memberDay(timezone: string | null | undefined, now: Date = new Date()): string {
  const tz = timezone || 'UTC'
  try {
    // en-CA renders dates as YYYY-MM-DD, the exact shape logged_for / the
    // idempotency key expect — so this is a drop-in for toISOString().slice(0,10).
    return now.toLocaleDateString('en-CA', { timeZone: tz })
  } catch {
    // Bad/unknown IANA tz → UTC (matches the pre-tz behaviour rather than failing).
    return now.toISOString().slice(0, 10)
  }
}

/**
 * Resolve the member's "today" string, preferring their durable, server-stored
 * timezone. Order:
 *   1. profiles.home_timezone (the durable anchor; cannot be spoofed by a client)
 *   2. an optional client-provided IANA tz (Intl…resolvedOptions().timeZone),
 *      used only when the member has no home_timezone on file yet
 *   3. UTC (the safe default if both are absent/invalid)
 *
 * The read is best-effort: any failure falls back to the client tz / UTC so a
 * profile-read hiccup never blocks logging. The day still flows consistently into
 * the idempotency key + the unique constraint because every caller resolves it the
 * same way.
 */
export async function resolveMemberDay(
  profileId: string,
  clientTimezone?: string | null,
  now: Date = new Date(),
): Promise<string> {
  return (await resolveMemberDayAndZone(profileId, clientTimezone, now)).day
}

/** The same resolution, returning the ZONE it chose alongside the day key.
 *
 *  Anything that both keys on the member's day AND has a side effect the database windows by day
 *  needs both halves, or the two disagree at the edges. `daily_login` was exactly that: the
 *  check-in guard keyed on this local day while `award_gems_atomic` capped on the UTC day, so a
 *  member west of UTC checking in during their evening and again the next morning fell inside one
 *  UTC day and was silently paid nothing the second time. Pass the zone through so the database
 *  can window on the SAME day the guard used. */
export async function resolveMemberDayAndZone(
  profileId: string,
  clientTimezone?: string | null,
  now: Date = new Date(),
): Promise<{ day: string; timezone: string }> {
  let homeTz: string | null = null
  try {
    const { data } = await createAdminClient()
      .from('profiles')
      .select('home_timezone')
      .eq('id', profileId)
      .maybeSingle()
    homeTz = (data as { home_timezone: string | null } | null)?.home_timezone ?? null
  } catch {
    // a profile-read failure must never block logging — fall through to client/UTC
  }
  // home_timezone wins (server-resolved, un-spoofable); else the client's IANA tz;
  // else UTC. memberDay validates the chosen tz and falls back to UTC if it's bad.
  const chosen = homeTz ?? clientTimezone ?? null
  const day = memberDay(chosen, now)
  // Report the zone memberDay actually USED, not the one requested: it falls back to UTC on an
  // invalid tz, and a caller windowing on a zone the day key was not computed in would reintroduce
  // the very mismatch this exists to close.
  return { day, timezone: isValidZone(chosen) ? (chosen as string) : 'UTC' }
}

function isValidZone(tz: string | null | undefined): boolean {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}
