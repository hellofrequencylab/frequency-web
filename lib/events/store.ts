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

/**
 * A space's events for its calendar tab (Events EC2), from `fromDay` (YYYY-MM-DD, inclusive) forward,
 * soonest first. PUBLIC contract, IDENTICAL to the EC1 subscribe feed (space_public_calendar_feed): only
 * PUBLISHED, public/unlisted, non-cancelled events — so the on-page grid and the subscribed .ics show the
 * exact same set, and neither leaks a draft, private, or circle_only event. Filtered by space_id so space
 * A never resolves space B's events. FAIL-SAFE: [] on any error / missing tenant. `space_id`/`visibility`
 * are not in the generated types (ADR-246), so the whole chain is reached through an untyped handle.
 */
export async function listSpaceCalendarEvents(
  spaceId: string | null | undefined,
  opts: { fromDay?: string; limit?: number } = {},
): Promise<SpaceCalendarEvent[]> {
  const sid = spaceId ?? (await loadRootSpaceId())
  if (!sid) return []
  const limit = opts.limit ?? 300
  const fromDay = opts.fromDay ?? new Date().toISOString().slice(0, 10)
  try {
    const db = createAdminClient().from('events') as unknown as {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            in: (col: string, vals: string[]) => {
              gte: (col: string, val: string) => {
                order: (col: string, opts: { ascending: boolean }) => {
                  limit: (n: number) => Promise<{ data: unknown; error: unknown }>
                }
              }
            }
          }
        }
      }
    }
    const { data, error } = await db
      .select(CALENDAR_COLS)
      .eq('space_id', sid)
      .eq('status', 'published')
      .in('visibility', ['public', 'unlisted'])
      .gte('starts_at', `${fromDay}T00:00:00Z`)
      .order('starts_at', { ascending: true })
      .limit(limit)
    if (error) return []
    return ((data as SpaceCalendarEvent[] | null) ?? []).filter((e) => !e.is_cancelled)
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
