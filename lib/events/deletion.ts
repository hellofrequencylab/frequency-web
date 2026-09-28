import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'
import {
  LOCAL_DELETE_PLAN,
  UNKNOWN_DELETE_PLAN,
  type EventDeletePlan,
} from './delete-plan'

// THE READ BEHIND THE DELETE WARNING (LIVE-535). Given an event, how far a delete on it would
// actually reach. The sentences live in lib/events/delete-plan.ts, which has zero imports so a client
// component can render them; this file is the half that needs a database and therefore cannot be
// imported from one (`pnpm check:client-boundary`).
//
// Why the count is not free: recurrence is MATERIALISED (ADR-007) and `events.parent_event_id` is
// `ON DELETE CASCADE`, so the reach of a delete is "how many rows point at this one", which is a
// query and not a column. See delete-plan.ts for the full shape of the trap.
//
// ── ADMIN CLIENT, AND WHY THAT IS RIGHT HERE ─────────────────────────────────────────────────────
// This runs on the service role, like loadSeriesCancelPlan next door in cancellation.ts, because a
// warning that undercounts is worse than no warning: a child date the caller cannot SEE is still a
// child date the cascade DELETES. Policy-filtered counting would quietly report a smaller number
// than the statement destroys, which is the failure this whole row exists to close. The caller is
// authorized before this is ever reached (`event.editSettings`); nothing here is returned to a
// browser except counts.

/** Child dates one plan will look at. A series past this is counted as "at least this many" rather
 *  than walked, so a pathological anchor cannot turn a confirm dialog into a table scan. Matches
 *  MAX_SERIES_CANCEL in cancellation.ts by intent: both bound one operator gesture. */
export const MAX_DELETE_PLAN_DATES = 400

/**
 * How far a delete on `eventId` reaches.
 *
 * Returns `LOCAL_DELETE_PLAN` for a one-off and for a CHILD occurrence, because deleting a child is
 * the local thing the operator expects: one row, one date, and no cascade beyond its own RSVPs.
 *
 * 🔴 NEVER THROWS, and never reports "local" for a read it could not do. Every failure path returns
 * `UNKNOWN_DELETE_PLAN`, whose `unknown` flag makes `deleteReachesOtherDates` true, so a database
 * that is having a bad minute blocks an irreversible delete instead of waving it through. A plan that
 * guessed "not an anchor" on an error would be the 2026-08-11 shape of bug: a fail-safe that fails
 * open and says nothing.
 */
export async function loadEventDeletePlan(eventId: string): Promise<EventDeletePlan> {
  if (!eventId) return UNKNOWN_DELETE_PLAN
  try {
    const admin = createAdminClient()

    // Is this row an anchor at all? A child carries parent_event_id and can stop here: one row, one
    // date. This is also the cheap path, which matters because every Delete button asks.
    const { data: self, error: selfErr } = await admin
      .from('events')
      .select('id, parent_event_id')
      .eq('id', eventId)
      .maybeSingle()
    if (selfErr) {
      log.warn('event_delete_plan_self_read_failed', { eventId, message: selfErr.message })
      return UNKNOWN_DELETE_PLAN
    }
    if (!self) return LOCAL_DELETE_PLAN
    if ((self as { parent_event_id: string | null }).parent_event_id) return LOCAL_DELETE_PLAN

    // The other dates. No `removed_at` filter and no cancelled filter ON PURPOSE: the cascade
    // deletes those rows too, and this number describes what the STATEMENT destroys rather than what
    // the calendar currently shows. Undercounting here is the failure mode.
    const { data: kids, error: kidsErr } = await admin
      .from('events')
      .select('id, starts_at')
      .eq('parent_event_id', eventId)
      .order('starts_at', { ascending: true })
      .limit(MAX_DELETE_PLAN_DATES + 1)
    if (kidsErr) {
      log.warn('event_delete_plan_children_read_failed', { eventId, message: kidsErr.message })
      return UNKNOWN_DELETE_PLAN
    }

    const all = (kids ?? []) as Array<{ id: string; starts_at: string | null }>
    if (all.length === 0) return LOCAL_DELETE_PLAN

    const truncated = all.length > MAX_DELETE_PLAN_DATES
    const rows = truncated ? all.slice(0, MAX_DELETE_PLAN_DATES) : all
    const nowIso = new Date().toISOString()
    let pastDates = 0
    for (const r of rows) if (r.starts_at && r.starts_at < nowIso) pastDates += 1

    // RSVPs on those dates. A failed count must not sink the whole plan: the DATE count is the
    // headline and is already known, so this degrades to 0 (and says so in the log) rather than
    // throwing away a warning the operator needs. `rsvpsAtRisk` is documented as a floor.
    let rsvpsAtRisk = 0
    const { count, error: rsvpErr } = await admin
      .from('event_rsvps')
      .select('id', { count: 'exact', head: true })
      .in(
        'event_id',
        rows.map((r) => r.id),
      )
    if (rsvpErr) log.warn('event_delete_plan_rsvp_count_failed', { eventId, message: rsvpErr.message })
    else rsvpsAtRisk = count ?? 0

    return {
      isAnchor: true,
      otherDates: rows.length,
      pastDates,
      futureDates: rows.length - pastDates,
      rsvpsAtRisk,
      truncated,
      unknown: false,
    }
  } catch (err) {
    log.warn('event_delete_plan_threw', {
      eventId,
      message: err instanceof Error ? err.message : String(err),
    })
    return UNKNOWN_DELETE_PLAN
  }
}
