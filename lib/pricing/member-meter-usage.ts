// MEMBER METER USAGE — the real counts behind the SIX personal (tier-axis) meters
// (docs/VALUE-LADDER.md Phase 4, Appendix A3: "all six tier-axis meters are total gaps").
//
// WHY THIS EXISTS. The Space plan-and-usage hub renders every plan-axis meter and feeds two of them a
// real count. The personal axis had nothing: the hub filters to `axis === 'plan'`, and the member
// upgrade page mounted no meter component at all. So a member could not see a single one of their own
// allowances anywhere in the product. A meter with no readout is a promise nobody can act on, and an
// upsell with no number is the kind of vague nag docs/CONTENT-VOICE.md exists to prevent.
//
// EVERY COUNT IS FAIL-SAFE and every read is a head+exact count (no rows pulled). A count is used for
// two things only: an informational "X of N used" readout, and deciding whether the 80% prompt shows.
// Nothing here blocks, refuses, or charges. A failed read resolves to null and the key is OMITTED
// rather than zeroed, so the surface renders the allowance ladder without a wrong number.
//
// TYPED READS ON PURPOSE. Every table here is in the generated types, so the queries are written
// against the typed client and `pnpm exec tsc --noEmit` catches a wrong column name. A loose `any`
// builder would have let a typo fail silently at runtime and quietly show a member the wrong number,
// which is the exact failure mode docs/VALUE-LADDER.md §6 Gate 5 question 4 is about.
//
// THE NUMBERS MATCH THE CAPS THEY ARE COMPARED TO. Where a live cap already exists, this counts the
// same rows it counts, because a readout that measures something adjacent to the enforced thing is
// worse than no readout:
//   - journey_publish  counts visibility past 'private' (unlisted AND public), which is what
//     lib/journeys/publish-gate.ts counts.
//   - vera_unlimited   reuses veraMessagesToday, the same ai_usage read the live cap enforces against.
//   - event_create     states both cancellation columns the way lib/events/follower-reminders.ts does.

import { createAdminClient } from '@/lib/supabase/admin'
import { veraMessagesToday } from '@/lib/ai/vera/usage-gate'
import { eventInstant, resolveZone } from '@/lib/time/zone'

/** The widest an IANA zone sits from UTC (UTC+14 / UTC-12), so a raw `starts_at` band padded by
 *  this much can never miss an event whose TRUE instant is inside the window. The same constant the
 *  reminder crons use (app/api/cron/event-reminders/route.ts). */
export const MAX_TZ_OFFSET_MS = 14 * 60 * 60 * 1000

/** The columns an "is this event still upcoming" decision needs. */
export interface UpcomingEventRow {
  starts_at: string
  time_zone: string | null
}

/**
 * Is this event still ahead of `now`, by its REAL instant? `starts_at` stores the host's wall-clock
 * as UTC parts (lib/time/zone.ts), so comparing it to a real `now()` is wrong by the event's zone
 * offset: a Los Angeles 7 pm event read as already started at noon local, a Sydney 9 am event read
 * as still upcoming until early evening local (scan2 L6-14, 2026-09-05). Resolve through the
 * event's own zone first, the way the reminder crons do. An unparseable row is NOT upcoming.
 */
export function isUpcomingByInstant(row: UpcomingEventRow, now: Date = new Date()): boolean {
  const inst = eventInstant(row.starts_at, resolveZone(row.time_zone))
  return !!inst && inst.getTime() >= now.getTime()
}

/** The real usage behind each personal (tier-axis) meter, keyed by feature key. A key is absent when
 *  its count could not be resolved, so the surface shows the ladder without inventing a number. */
export type MemberMeterUsage = Partial<Record<string, number>>

/** Published Journeys this member owns, counted the way the live publish cap counts them: anything
 *  past 'private' (unlisted is live to a space, public is live to the library). Fail-safe null. */
export async function memberPublishedJourneys(profileId: string): Promise<number | null> {
  try {
    const { count } = await createAdminClient()
      .from('journey_plans')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', profileId)
      .neq('visibility', 'private')
    return typeof count === 'number' ? count : null
  } catch {
    return null
  }
}

/** ACTIVE enrollees across every Journey this member authored (an enrollment with no completed_at).
 *  Two reads on purpose: the plan-id list is small, and an embedded filter join is the kind of query
 *  that silently returns everything when it is wrong. Fail-safe null. */
export async function memberJourneyEnrollees(profileId: string): Promise<number | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('journey_plans').select('id').eq('author_id', profileId)
    const planIds = (data ?? []).map((p) => p.id)
    if (planIds.length === 0) return 0
    const { count } = await admin
      .from('journey_enrollments')
      .select('id', { count: 'exact', head: true })
      .in('plan_id', planIds)
      .is('completed_at', null)
    return typeof count === 'number' ? count : null
  } catch {
    return null
  }
}

/** Circles this member hosts (host_id), excluding archived ones (the same clause lib/circles/store.ts
 *  uses). Fail-safe null. */
export async function memberHostedCircles(profileId: string): Promise<number | null> {
  try {
    const { count } = await createAdminClient()
      .from('circles')
      .select('id', { count: 'exact', head: true })
      .eq('host_id', profileId)
      .neq('status', 'archived')
    return typeof count === 'number' ? count : null
  } catch {
    return null
  }
}

/** Practices this member published: created by them and public, so others can adopt them. Archiving a
 *  practice clears is_public, so this clause alone is the published set. Fail-safe null. */
export async function memberPublishedPractices(profileId: string): Promise<number | null> {
  try {
    const { count } = await createAdminClient()
      .from('practices')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', profileId)
      .eq('is_public', true)
    return typeof count === 'number' ? count : null
  } catch {
    return null
  }
}

/**
 * ACTIVE events this member hosts: published, still upcoming, not cancelled, not removed. The
 * event_create meter counts how many run AT ONCE, never whether they may charge (selling is free on
 * every tier, ADR-914), so a past event never counts against it.
 *
 * ⚠️ The two cancellation signals on `events` are SEPARATE columns: `status` is the lifecycle
 * ('published' vs a draft) and `is_cancelled` is the cancellation flag. Filtering `status` for
 * 'cancelled' would be a no-op that also counted every draft. Both clauses are stated exactly the way
 * lib/events/follower-reminders.ts states them. `is_cancelled` is nullable, so `.eq(false)` drops a
 * null row: that UNDER-counts, which for a display-only nudge is the right direction to fail.
 *
 * 2026-09-05 (scan2 L6-14): "still upcoming" is decided by the event's REAL instant, not by the raw
 * `starts_at` wall-clock. The query widens the band by MAX_TZ_OFFSET_MS so no candidate is missed,
 * then isUpcomingByInstant keeps the rows whose resolved instant is ahead of now. This is the one
 * read here that pulls rows rather than a head count, because the decision cannot be made in SQL
 * against the stored convention; a host's own live events are a handful.
 */
export async function memberActiveEvents(profileId: string, now: Date = new Date()): Promise<number | null> {
  try {
    const { data, error } = await createAdminClient()
      .from('events')
      .select('starts_at, time_zone')
      .eq('host_id', profileId)
      .eq('status', 'published')
      .eq('is_cancelled', false)
      .is('removed_at', null)
      .gte('starts_at', new Date(now.getTime() - MAX_TZ_OFFSET_MS).toISOString())
    if (error || !Array.isArray(data)) return null
    return (data as unknown as UpcomingEventRow[]).filter((row) => isUpcomingByInstant(row, now)).length
  } catch {
    return null
  }
}

/**
 * Every personal meter's real usage for one member, resolved in parallel. Keys map 1:1 onto the
 * tier-axis rows of PLACEHOLDER_METER_LIMITS. A key is OMITTED (not zeroed) when its read failed.
 * Never throws.
 */
export async function memberMeterUsage(profileId: string | null | undefined): Promise<MemberMeterUsage> {
  if (!profileId) return {}
  const [vera, journeys, enrollees, circles, practices, events] = await Promise.all([
    veraMessagesToday(profileId).catch(() => null),
    memberPublishedJourneys(profileId),
    memberJourneyEnrollees(profileId),
    memberHostedCircles(profileId),
    memberPublishedPractices(profileId),
    memberActiveEvents(profileId),
  ])
  const usage: MemberMeterUsage = {}
  if (typeof vera === 'number') usage.vera_unlimited = vera
  if (typeof journeys === 'number') usage.journey_publish = journeys
  if (typeof enrollees === 'number') usage.journey_enrollees = enrollees
  if (typeof circles === 'number') usage.circle_host = circles
  if (typeof practices === 'number') usage.practice_publish = practices
  if (typeof events === 'number') usage.event_create = events
  return usage
}
