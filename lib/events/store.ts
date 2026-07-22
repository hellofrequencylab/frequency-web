// Events tenancy data layer (Phase 0, ENTITY-SPACES-BUILD Epic 0.3 / ENTITY-SPACES-SYSTEM
// §4.3). Two seams the per-space profile work (Phase 1) needs:
//   - stampEventSpaceId(): the DEFAULT space_id for a new event — the root space (via
//     loadRootSpaceId), so new events created through the existing single-tenant flows are
//     space-stamped to root and nothing changes today. A space-scoped caller passes its own id.
//   - listEventsForSpace(): the by-space read the Phase 1 profile's `entity-offerings` /
//     `entity-schedule` modules use to list a Space's own events.
//
// Server-only (admin client; callers enforce authz, exactly like the existing event flows).
// `space_id` is not in the generated DB types yet — the column is added by
// 20260711000000_object_space_id.sql; per the codebase pattern (ADR-246) it is reached with
// untyped casts (the payload field + the `.eq('space_id', …)` filter), not a typed client.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRootSpaceId } from '@/lib/spaces/store'

/** An event as the by-space read returns it (the columns the offerings/schedule modules need). */
export interface SpaceEvent {
  id: string
  slug: string
  title: string
  description: string | null
  starts_at: string
  ends_at: string | null
  host_id: string | null
  scope_id: string | null
  scope_type: string | null
  is_cancelled: boolean | null
  space_id: string | null
}

const COLS =
  'id, slug, title, description, starts_at, ends_at, host_id, scope_id, scope_type, is_cancelled, space_id'

/** An event row for the per-space CALENDAR (Events EC2): the fields the month grid + popup need. */
export interface SpaceCalendarEvent {
  id: string
  slug: string
  title: string
  starts_at: string
  ends_at: string | null
  location: string | null
  time_zone: string | null
  is_cancelled: boolean | null
}

const CALENDAR_COLS = 'id, slug, title, starts_at, ends_at, location, time_zone, is_cancelled'

/** A calendar event row as read untyped (status/visibility/space_id aren't in the generated types). */
export type SpaceCalendarEventRow = SpaceCalendarEvent & {
  status?: string | null
  visibility?: string | null
}

/** The PER-SPACE calendar gate, applied on the event's OWN row in every branch (the leak contract):
 *  published + public/unlisted + non-cancelled + starting on/after `fromDay`. This is the exact set the
 *  space feed RPC (space_public_calendar_feed) enforces in SQL; kept pure here so the store readers and
 *  the shared-event UNION apply the identical gate on each event's OWN row. Pure + unit-tested. */
export function passesCalendarGate(e: SpaceCalendarEventRow, fromDayIso: string): boolean {
  return (
    !e.is_cancelled &&
    (e.status ?? 'published') === 'published' &&
    (e.visibility === 'public' || e.visibility === 'unlisted') &&
    startsOnOrAfter(e.starts_at, fromDayIso)
  )
}

/** Instant compare that survives ISO offset-format differences (`Z` vs `+00:00`): parse both. A
 *  missing/invalid start (NaN) fails closed. Pure. */
function startsOnOrAfter(startsAt: string | null | undefined, fromDayIso: string): boolean {
  if (!startsAt) return false
  const t = new Date(startsAt).getTime()
  return !Number.isNaN(t) && t >= new Date(fromDayIso).getTime()
}

/** The MASTER-calendar gate: like passesCalendarGate but PUBLIC ONLY — 'unlisted' is EXCLUDED (the
 *  master feed is discovery, not link-reachable). Mirrors the `visibility = 'public'` clause of the
 *  public_calendar_feed() RPC, which is the runtime authority; this pure mirror documents + tests the
 *  exclusion so a regression is caught. Pure + unit-tested. */
export function masterCalendarIncludes(e: SpaceCalendarEventRow, fromDayIso: string): boolean {
  return (
    !e.is_cancelled &&
    (e.status ?? 'published') === 'published' &&
    e.visibility === 'public' &&
    startsOnOrAfter(e.starts_at, fromDayIso)
  )
}

/** UNION the space's OWN calendar rows with rows accepted-SHARED to it: re-apply the per-event gate on
 *  EACH row (the leak contract — a share is necessary, never sufficient), dedupe by id, sort by
 *  starts_at, cap at `limit`. Pure over the already-fetched rows, so the merge is unit-tested. */
export function mergeSpaceCalendarRows(
  ownRows: SpaceCalendarEventRow[],
  sharedRows: SpaceCalendarEventRow[],
  fromDayIso: string,
  limit: number,
): SpaceCalendarEvent[] {
  const byId = new Map<string, SpaceCalendarEvent>()
  for (const e of [...ownRows, ...sharedRows]) {
    if (!passesCalendarGate(e, fromDayIso)) continue
    if (!byId.has(e.id)) byId.set(e.id, e)
  }
  return [...byId.values()]
    .sort((a, b) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0))
    .slice(0, limit)
}

/** Untyped admin handle — space_id / visibility / event_space_shares are newer than the generated
 *  types (ADR-246), so the reads below reach them through this loose handle. */
function untypedAdmin(): SupabaseClient {
  return createAdminClient()
}

/** Event ids ACCEPTED-shared TO this space (EC3). The share is NECESSARY here; the per-event
 *  visibility gate (passesCalendarGate) is re-applied by the caller on each event's OWN row, so a
 *  share never surfaces a private/draft/cancelled event. FAIL-SAFE: [] on any error. */
async function acceptedShareEventIds(admin: SupabaseClient, spaceId: string): Promise<string[]> {
  try {
    const { data, error } = await admin
      .from('event_space_shares')
      .select('event_id')
      .eq('space_id', spaceId)
      .eq('status', 'accepted')
    if (error) return []
    return [...new Set(((data ?? []) as Array<{ event_id: string }>).map((r) => r.event_id))]
  } catch {
    return []
  }
}

/**
 * A space's events for its calendar tab (Events EC2) + events accepted-SHARED to it (EC3), from
 * `fromDay` (YYYY-MM-DD, inclusive) forward, soonest first, deduped by id. Same EVENT filters as the
 * EC1 subscribe feed (space_public_calendar_feed): only PUBLISHED, public/unlisted, non-cancelled
 * events — so the on-page grid and the subscribed .ics show the exact same event set, and neither leaks
 * a draft, private, or circle_only event, EVEN via a share. The shared branch re-applies the gate on
 * each event's OWN row (passesCalendarGate): an accepted share is necessary, never sufficient. Owned
 * events are filtered by space_id so space A never resolves space B's OWN events. FAIL-SAFE: [] on any
 * error / missing tenant. `space_id`/`visibility`/`event_space_shares` are reached untyped (ADR-246).
 */
export async function listSpaceCalendarEvents(
  spaceId: string | null | undefined,
  opts: { fromDay?: string; limit?: number } = {},
): Promise<SpaceCalendarEvent[]> {
  const sid = spaceId ?? (await loadRootSpaceId())
  if (!sid) return []
  const limit = opts.limit ?? 300
  const fromDay = opts.fromDay ?? new Date().toISOString().slice(0, 10)
  const fromDayIso = `${fromDay}T00:00:00Z`
  try {
    const admin = untypedAdmin()
    const shareIds = await acceptedShareEventIds(admin, sid)

    // Owned events (by space_id) and, if any, shared events (by id) — each gated on the event's OWN
    // row. Two reads unioned in-app; the DB feed does the same UNION server-side.
    const ownedQ = admin
      .from('events')
      .select(`${CALENDAR_COLS}, status, visibility`)
      .eq('space_id', sid)
      .eq('status', 'published')
      .in('visibility', ['public', 'unlisted'])
      .gte('starts_at', fromDayIso)
      .order('starts_at', { ascending: true })
      .limit(limit)
    const sharedQ = shareIds.length
      ? admin
          .from('events')
          .select(`${CALENDAR_COLS}, status, visibility`)
          .in('id', shareIds)
          .eq('status', 'published')
          .in('visibility', ['public', 'unlisted'])
          .gte('starts_at', fromDayIso)
          .order('starts_at', { ascending: true })
          .limit(limit)
      : Promise.resolve({ data: [], error: null })

    const [owned, shared] = await Promise.all([ownedQ, sharedQ])
    if (owned.error) return []

    // UNION own + shared, re-gate each row (shared events MUST pass on their OWN row), dedupe, sort.
    return mergeSpaceCalendarRows(
      (owned.data as SpaceCalendarEventRow[] | null) ?? [],
      shared.error ? [] : ((shared.data as SpaceCalendarEventRow[] | null) ?? []),
      fromDayIso,
      limit,
    )
  } catch {
    return []
  }
}

/**
 * True when a space has at least one upcoming event the CALENDAR would show — its OWN published,
 * public/unlisted, non-cancelled upcoming event, OR one accepted-SHARED to it (EC3). Uses the SAME
 * per-event gate as listSpaceCalendarEvents so the tab never appears over an empty grid (a space whose
 * only upcoming events are drafts / private / circle_only, owned or shared, must NOT get the tab).
 * FAIL-SAFE: false on any error / missing tenant.
 */
export async function spaceHasPublicUpcomingEvents(spaceId: string | null | undefined): Promise<boolean> {
  const sid = spaceId ?? (await loadRootSpaceId())
  if (!sid) return false
  const today = new Date().toISOString().slice(0, 10)
  const fromDayIso = `${today}T00:00:00Z`
  try {
    const admin = untypedAdmin()
    const { data: owned, error } = await admin
      .from('events')
      .select('id')
      .eq('space_id', sid)
      .eq('status', 'published')
      .eq('is_cancelled', false)
      .in('visibility', ['public', 'unlisted'])
      .gte('starts_at', fromDayIso)
      .limit(1)
    if (!error && Array.isArray(owned) && owned.length > 0) return true

    // No own upcoming event — does an accepted SHARE surface one (gated on the event's OWN row)?
    const shareIds = await acceptedShareEventIds(admin, sid)
    if (shareIds.length === 0) return false
    const { data: shared, error: sErr } = await admin
      .from('events')
      .select('id')
      .in('id', shareIds)
      .eq('status', 'published')
      .eq('is_cancelled', false)
      .in('visibility', ['public', 'unlisted'])
      .gte('starts_at', fromDayIso)
      .limit(1)
    return !sErr && Array.isArray(shared) && shared.length > 0
  } catch {
    return false
  }
}

/**
 * The MASTER Frequency calendar (Events EC3): ALL upcoming published PUBLIC (never unlisted)
 * non-cancelled events across the network — the one authoritative read behind both the /events/calendar
 * grid and the master .ics feed. Delegates to public_calendar_feed(), which self-gates in-function
 * (the same set the .ics route renders), so the grid and the subscribed feed can never drift.
 * FAIL-SAFE: [] on any error. The RPC is newer than the generated types, so it's reached untyped.
 */
export async function listPublicCalendarEvents(): Promise<SpaceCalendarEvent[]> {
  try {
    const rpc = createAdminClient() as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
    }
    const { data, error } = await rpc.rpc('public_calendar_feed', {})
    if (error || !Array.isArray(data)) return []
    return (data as SpaceCalendarEvent[]).filter((e) => !e.is_cancelled)
  } catch {
    return []
  }
}

/**
 * The space_id to stamp on a NEW event: the explicit owning space, else the root space (so the
 * existing single-tenant create flows default to root and behave exactly as today). Returns null
 * only if the root row is missing (pre-migration) — callers then omit the field, leaving the
 * column NULL, which the backfill later sweeps to root.
 */
export async function stampEventSpaceId(spaceId?: string | null): Promise<string | null> {
  return spaceId ?? (await loadRootSpaceId())
}

/**
 * Events that BELONG TO a space, soonest-upcoming first. Defaults to the root space (so a caller
 * that passes no spaceId reads the root's events, the canary). Filtered by space_id so an event
 * in space A can never resolve for space B. When `upcomingOnly`, only events starting from now.
 * FAIL-SAFE: [] on any error / missing tenant.
 */
export async function listEventsForSpace(
  spaceId?: string | null,
  opts: { limit?: number; upcomingOnly?: boolean } = {},
): Promise<SpaceEvent[]> {
  const sid = spaceId ?? (await loadRootSpaceId())
  if (!sid) return []
  const limit = opts.limit ?? 50
  try {
    // space_id isn't in the generated types yet — reach it with an untyped handle (ADR-246).
    const db = createAdminClient().from('events') as unknown as {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          gte: (col: string, val: string) => unknown
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{ data: unknown; error: unknown }>
          }
        }
      }
    }
    type Chain = {
      gte: (col: string, val: string) => Chain
      order: (col: string, opts: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: unknown; error: unknown }> }
    }
    let q = db.select(COLS).eq('space_id', sid) as unknown as Chain
    if (opts.upcomingOnly) q = q.gte('starts_at', new Date().toISOString())
    const { data, error } = await q.order('starts_at', { ascending: true }).limit(limit)
    if (error) return []
    return (data as SpaceEvent[] | null) ?? []
  } catch {
    return []
  }
}
