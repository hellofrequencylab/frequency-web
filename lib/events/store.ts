// Events tenancy data layer (Phase 0, ENTITY-SPACES-BUILD Epic 0.3 / ENTITY-SPACES-SYSTEM
// §4.3). Two seams the per-space profile work (Phase 1) needs:
//   - stampEventSpaceId(): the DEFAULT space_id for a new event — the root space (via
//     loadRootSpaceId), so new events created through the existing single-tenant flows are
//     space-stamped to root and nothing changes today. A space-scoped caller passes its own id.
//   - listEventsForSpace(): the by-space read the Phase 1 profile's `entity-offerings` /
//     `entity-schedule` modules use to list a Space's own events.
//
// Server-only (admin client; callers enforce authz, exactly like the existing event flows).
// `space_id` (20260711000000_object_space_id.sql) and the rest of the columns here are covered
// by the regenerated DB types (ADR-246 closed), so everything reads through the typed client.

import { createAdminClient } from '@/lib/supabase/admin'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { readEventCoverFocus } from '@/lib/events/cover-focus'
import { DEFAULT_OBJECT_POSITION } from '@/lib/images/focal-point'

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
  time_zone: string | null
  /** 'draft' | 'published' — the manage calendar badges drafts; public readers filter on it. */
  status: string | null
  location: string | null
  // ── Space-page Events block fields (view upgrade) — all in the generated DB types now (ADR-246
  // closed). All additive + nullable, so every existing caller
  // keeps its shape. capacity/price feed the card + popup; join_mode/hide_address carry the ADR-826 /
  // ADR-825 semantics; city/region/venue_name let a reader build the viewer-safe place line.
  capacity?: number | null
  price_cents?: number | null
  join_mode?: 'auto' | 'rsvp' | 'tickets' | null
  hide_address?: boolean | null
  city?: string | null
  region?: string | null
  venue_name?: string | null
  attendance_mode?: string | null
  is_demo?: boolean | null
}

const COLS =
  'id, slug, title, description, starts_at, ends_at, host_id, scope_id, scope_type, is_cancelled, space_id, time_zone, status, location, capacity, price_cents, join_mode, hide_address, city, region, venue_name, attendance_mode, is_demo'

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

/** A calendar event row with the gate columns (status/visibility) alongside the display fields. */
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

/** A shared-event row carries its HOME space id so the reader can re-gate the home space (below). */
export type SharedCalendarEventRow = SpaceCalendarEventRow & { space_id?: string | null }

/** Keep only accepted-shared rows whose HOME space may surface events on a co-host calendar: a
 *  network-visible + active space (`allowedHomeSpaceIds`), OR a platform event with no home space
 *  (`space_id` null). This is the co-host equivalent of the owned branch's `spaces` join — without it,
 *  a share out-lives its home space's walling (a suspended/hidden space's public event would keep
 *  showing on co-hosts). Mirrors the `space_public_calendar_feed` shared-branch home-space gate. Pure. */
export function filterSharedByHomeSpace(
  sharedRows: SharedCalendarEventRow[],
  allowedHomeSpaceIds: Set<string>,
): SharedCalendarEventRow[] {
  return sharedRows.filter((e) => e.space_id == null || allowedHomeSpaceIds.has(e.space_id))
}

/** The typed admin client — space_id / visibility / event_space_shares are all in the generated
 *  types (ADR-246 closed). */
type AdminClient = ReturnType<typeof createAdminClient>

/** Which of `spaceIds` are network-visible + active — the home spaces allowed to surface events on a
 *  co-host calendar (the shared branch's home-space gate). Platform events (null home) skip this and are
 *  allowed by `filterSharedByHomeSpace` directly. FAIL-SAFE: empty set on any error (drops every
 *  real-home shared event rather than risk surfacing a walled space's event). */
async function networkActiveHomeSpaceIds(admin: AdminClient, spaceIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(spaceIds)]
  if (ids.length === 0) return new Set()
  try {
    const { data, error } = await admin
      .from('spaces')
      .select('id')
      .in('id', ids)
      .eq('visibility', 'network')
      .eq('status', 'active')
    if (error) return new Set()
    return new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id))
  } catch {
    return new Set()
  }
}

/** Event ids ACCEPTED-shared TO this space (EC3). The share is NECESSARY here; the per-event
 *  visibility gate (passesCalendarGate) is re-applied by the caller on each event's OWN row, so a
 *  share never surfaces a private/draft/cancelled event. FAIL-SAFE: [] on any error. */
async function acceptedShareEventIds(admin: AdminClient, spaceId: string): Promise<string[]> {
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

// Interpolated into PostgREST `.or()` filter strings below, so validate the shape even though both
// values come from our own DB reads (the same sanitizer-by-construction rule as
// lib/events/circle-upcoming.ts circleEventScopeFilter).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── WHY THERE IS NO OWNER LOOKUP HERE (ADR-905) ───────────────────────────────────────────
// ADR-898 added two OWNER-IDENTITY membership axes to the Space calendar: events whose `host_id`
// is the Space's owner, and events that owner had personally accepted a cohost invite to. Both
// are deleted, and neither may come back.
//
// A PERSON IS NOT A SPACE. Owning a Space does not make everything you personally host that
// Space's programming, and the moment one person owns two Spaces the rule cross-contaminates
// every one of them. Measured on production before removal: those two axes placed 11 events on
// Space calendars that did not belong there (one owner's personally-hosted event appearing on all
// ten of their Spaces) and 0 that did. The explicit `host_space_id` axis contributed 0 rows
// beyond tenancy, because tenancy already covered every real case.
//
// Membership is now three DECLARATIONS, never an inference: the event is homed here (`space_id`),
// the event names this Space as its host (`host_space_id`), or it was accepted-shared here.
// The owner's report: "Space calendars should only show events, features and programs offered by
// that space."
//
// The co-hosting need ADR-898 was reaching for is real, but `event_cohosts` is keyed by PROFILE,
// so it cannot express "this Space co-hosts" — only "this person does". `host_space_id` is the
// column that expresses it, and it is single-valued (see ADR-905 for the two-Space gap).

/**
 * A space's events for its calendar tab (Events EC2), from `fromDay` (YYYY-MM-DD, inclusive) forward,
 * soonest first, deduped by id. MEMBERSHIP (ADR-905) is three DECLARATIONS, never an inference:
 * tenancy (the event is homed here), the hosting axis (the event names this space via
 * host_space_id), and events accepted-SHARED to the space (EC3). Nothing keys on WHO OWNS the
 * space — see the block above. Same EVENT filters as the EC1 subscribe
 * feed (space_public_calendar_feed, recreated in lockstep by 20270125000000): only PUBLISHED,
 * public/unlisted, non-cancelled events — so the on-page grid and the subscribed .ics show the exact
 * same set, and neither leaks a draft, private, or circle_only event, EVEN via membership. Every
 * non-tenancy row re-applies the gate on its OWN columns (passesCalendarGate) AND its home space's
 * walling: membership is necessary, never sufficient. FAIL-SAFE: [] on any error / missing tenant.
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
    const admin = createAdminClient()
    // Membership (ADR-905): tenancy (space_id) + the hosting axis (host_space_id) + accepted
    // shares. Three DECLARATIONS that the event belongs to this Space. The owner-identity axes
    // ADR-898 added are gone; see the block above for why they can never come back.
    const awayIds = await acceptedShareEventIds(admin, sid)

    // Owned events (tenancy — their home IS this space, which the page already resolved as
    // visible), events that NAME this space as host (their home may be ANY space, so they run
    // through the same home-space re-gate as shares), and accepted-share rows by id. Three reads
    // unioned in-app; the DB feed (space_public_calendar_feed) does the same UNION server-side.
    const ownedQ = admin
      .from('events')
      .select(`${CALENDAR_COLS}, status, visibility`)
      .eq('space_id', sid)
      .eq('status', 'published')
      .in('visibility', ['public', 'unlisted'])
      .gte('starts_at', fromDayIso)
      .order('starts_at', { ascending: true })
      .limit(limit)
    // Now a plain `.eq()`, not an interpolated `.or()` string. Dropping `host_id` (ADR-905) left
    // this axis with a single term, so the filter-string interpolation that made UUID-guarding
    // necessary is gone with it — the value is parameterised by PostgREST instead.
    const hostedQ = admin
      .from('events')
      .select(`${CALENDAR_COLS}, status, visibility, space_id`)
      .eq('host_space_id', sid)
      .eq('status', 'published')
      .in('visibility', ['public', 'unlisted'])
      .gte('starts_at', fromDayIso)
      .order('starts_at', { ascending: true })
      .limit(limit)
    const sharedQ = awayIds.length
      ? admin
          .from('events')
          .select(`${CALENDAR_COLS}, status, visibility, space_id`)
          .in('id', awayIds)
          .eq('status', 'published')
          .in('visibility', ['public', 'unlisted'])
          .gte('starts_at', fromDayIso)
          .order('starts_at', { ascending: true })
          .limit(limit)
      : Promise.resolve({ data: [], error: null })

    const [owned, hosted, shared] = await Promise.all([ownedQ, hostedQ, sharedQ])
    if (owned.error) return []

    // Re-gate the HOME space of every non-tenancy row (network + active; platform events and rows
    // whose home IS this space excepted) before the merge — hosting, cohosting, and shares are all
    // necessary-never-sufficient, and none may out-live its home space's walling.
    const awayRows: SharedCalendarEventRow[] = [
      ...(hosted.error ? [] : ((hosted.data as SharedCalendarEventRow[] | null) ?? [])),
      ...(shared.error ? [] : ((shared.data as SharedCalendarEventRow[] | null) ?? [])),
    ]
    const allowedHomes = await networkActiveHomeSpaceIds(
      admin,
      awayRows.map((e) => e.space_id).filter((id): id is string => !!id && id !== sid),
    )
    allowedHomes.add(sid) // rows homed HERE were already gated by the page's own space resolve
    const gatedAway = filterSharedByHomeSpace(awayRows, allowedHomes)

    // UNION own + hosted + shared, re-gate each row on its OWN columns, dedupe, sort.
    return mergeSpaceCalendarRows(
      (owned.data as SpaceCalendarEventRow[] | null) ?? [],
      gatedAway,
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
    const admin = createAdminClient()
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

    // No tenancy-owned upcoming event — does the rest of membership (ADR-905: the hosting axis and
    // accepted shares) surface one? MUST stay the SAME rule as listSpaceCalendarEvents, or the tab
    // hides over a non-empty grid or appears over an empty one. Gate on the event's OWN row AND its
    // HOME space (network + active; platform events and rows homed here excepted). Fetch candidates
    // (not limit(1)) since a candidate's home may be walled.
    const awayIds = await acceptedShareEventIds(admin, sid)

    // Both values below are interpolated into the `.or()` filter string, so both are UUID-guarded.
    const safeAwayIds = awayIds.filter((id) => UUID_RE.test(id))
    const membershipFilter = UUID_RE.test(sid)
      ? [
          `host_space_id.eq.${sid}`,
          safeAwayIds.length ? `id.in.(${safeAwayIds.join(',')})` : null,
        ].filter(Boolean).join(',')
      : null
    if (!membershipFilter) return false

    const { data: candidates, error: cErr } = await admin
      .from('events')
      .select('id, space_id')
      .or(membershipFilter)
      .eq('status', 'published')
      .eq('is_cancelled', false)
      .in('visibility', ['public', 'unlisted'])
      .gte('starts_at', fromDayIso)
    if (cErr || !Array.isArray(candidates) || candidates.length === 0) return false
    const rows = candidates as Array<{ id: string; space_id?: string | null }>
    const allowedHomes = await networkActiveHomeSpaceIds(
      admin,
      rows.map((e) => e.space_id).filter((id): id is string => !!id && id !== sid),
    )
    allowedHomes.add(sid)
    return rows.some((e) => e.space_id == null || allowedHomes.has(e.space_id))
  } catch {
    return false
  }
}

/**
 * The MASTER Frequency calendar (Events EC3): ALL upcoming published PUBLIC (never unlisted)
 * non-cancelled events across the network — the one authoritative read behind both the /events/calendar
 * grid and the master .ics feed. Delegates to public_calendar_feed(), which self-gates in-function
 * (the same set the .ics route renders), so the grid and the subscribed feed can never drift.
 * FAIL-SAFE: [] on any error. The RPC is in the regenerated types (ADR-246 closed), so it's typed.
 */
export async function listPublicCalendarEvents(): Promise<SpaceCalendarEvent[]> {
  try {
    const { data, error } = await createAdminClient().rpc('public_calendar_feed')
    if (error || !Array.isArray(data)) return []
    return data.filter((e) => !e.is_cancelled)
  } catch {
    return []
  }
}

// ── Calendar engagement (Events EC2/EC4 polish): "N going" + cover, enriched OUTSIDE the feed RPCs ──

/** Per-event engagement shown on the calendar popup: the confirmed 'going' count (social proof) and the
 *  event's cover image URL. Kept separate from the calendar feed rows so the .ics feed contract and the
 *  two feed RPCs are untouched — this is a display-only enrichment over the ids already on the grid. */
export interface CalendarEngagement {
  going: number
  coverUrl: string | null
  /** The host-picked focal point for that cover (events.theme.coverFocus) as a CSS
   *  object-position — the SAME value the event page hero applies, so a calendar/popup cover crops
   *  through the same point instead of dead center. Unset events resolve to the centered default. */
  coverFocus: string
}

/** PURE: tally confirmed 'going' RSVP rows into a per-event count (ignores maybe/waitlist/cancelled). */
export function tallyGoingByEvent(rows: Array<{ event_id: string; status?: string | null }>): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) {
    if ((r.status ?? '') !== 'going' || !r.event_id) continue
    out.set(r.event_id, (out.get(r.event_id) ?? 0) + 1)
  }
  return out
}

/** Engagement (going count + resolved cover URL) for a set of calendar event ids, in TWO reads
 *  (event_rsvps + events.cover_image_path). FAIL-SAFE to an empty map (a read error just drops the
 *  social-proof/cover, never the event). Cover URLs come from the public 'event-media' bucket (the same
 *  the event page uses), so no signed-URL round-trip. Every requested id gets an entry (default 0/null).
 *  `event_rsvps` / `cover_image_path` are typed reads (ADR-246 closed). */
export async function listCalendarEngagement(eventIds: string[]): Promise<Map<string, CalendarEngagement>> {
  const ids = [...new Set(eventIds)].filter(Boolean)
  const out = new Map<string, CalendarEngagement>()
  if (ids.length === 0) return out
  try {
    const admin = createAdminClient()
    const [rsvpRes, coverRes] = await Promise.all([
      admin.from('event_rsvps').select('event_id, status').in('event_id', ids).eq('status', 'going'),
      admin.from('events').select('id, cover_image_path, theme').in('id', ids),
    ])
    const going = tallyGoingByEvent((rsvpRes.data as Array<{ event_id: string; status?: string | null }> | null) ?? [])
    const coverPath = new Map<string, string | null>()
    const coverFocusById = new Map<string, string>()
    for (const r of (coverRes.data ?? [])) {
      coverPath.set(r.id, r.cover_image_path ?? null)
      coverFocusById.set(r.id, readEventCoverFocus(r.theme))
    }
    for (const id of ids) {
      const path = coverPath.get(id) ?? null
      let coverUrl: string | null = null
      if (path) {
        const { data: pub } = admin.storage.from('event-media').getPublicUrl(path)
        coverUrl = pub?.publicUrl ?? null
      }
      out.set(id, {
        going: going.get(id) ?? 0,
        coverUrl,
        coverFocus: coverFocusById.get(id) ?? DEFAULT_OBJECT_POSITION,
      })
    }
    return out
  } catch {
    return out
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
    let q = createAdminClient().from('events').select(COLS).eq('space_id', sid)
    if (opts.upcomingOnly) q = q.gte('starts_at', new Date().toISOString())
    const { data, error } = await q.order('starts_at', { ascending: true }).limit(limit)
    if (error) return []
    // The typed rows carry starts_at as string|null and join_mode as plain string; SpaceEvent keeps
    // the narrower app-facing shape every caller already consumes.
    return (data as SpaceEvent[] | null) ?? []
  } catch {
    return []
  }
}
