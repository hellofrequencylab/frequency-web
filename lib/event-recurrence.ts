// Event recurrence helpers.
//
// We materialise future occurrences as real event rows rather than computing
// them on the fly. See migration 20240208 for the rationale (RSVP semantics,
// per-occurrence cancellation, no query-layer changes).
//
// The window we keep materialised is HORIZON_DAYS. The cron at
// /api/cron/event-occurrences runs daily to roll this forward.

import { createAdminClient } from '@/lib/supabase/admin'

export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly'

export const HORIZON_DAYS = 60

type Anchor = {
  id:               string
  title:            string
  description:      string | null
  host_id:          string | null
  scope_id:         string
  scope_type:       string
  location:         string | null
  starts_at:        string
  ends_at:          string | null
  slug:             string
  recurrence_type:  RecurrenceType
  recurrence_until: string | null
  is_cancelled:     boolean | null
  removed_at:       string | null
} & Partial<Record<InheritedColumn, unknown>>

// ── WHAT A MATERIALISED OCCURRENCE INHERITS ─────────────────────────────────────────────────
//
// An occurrence row IS the anchor, on another date. Anything not copied here falls to the
// COLUMN DEFAULT, and the defaults are not neutral: `visibility` defaults to 'circle_only',
// `price_cents` to NULL (free), `time_zone` to America/Los_Angeles, and the
// `events_default_space_id` trigger rewrites a NULL `space_id` to the ROOT space. So an
// un-copied column does not merely go missing, it silently contradicts the anchor — a $22
// weekly series materialised free occurrences, scoped to a Circle the region-scoped event has
// no membership for (so RLS hid them from every member but the host), tenanted to root instead
// of the hosting Business Space, with no venue, no map point and no cover image (ADR-883 shape:
// the write never reaches the columns the readers consult).
//
// The list is ONE constant used for BOTH the anchor SELECT and the child payload, so a column
// can never be read without being written (which is exactly how the two halves drifted).
//
// DELIBERATELY NOT inherited, each for a reason:
//   • parent_event_id / recurrence_* / slug / starts_at / ends_at — the occurrence's own identity.
//   • claim_token / claimed_at        — a claim link is one-per-event by construction.
//   • cancelled_* / removed_*         — per-occurrence lifecycle; a cancelled anchor is skipped.
//   • mux_stream_id / mux_playback_id — a live stream belongs to one broadcast.
//   • featured_at                     — operator curation of a specific date, not a property.
//   • scope_circle_id / scope_region_id — derived from the bare pair by trg_events_sync_scope_arc.
const INHERITED_COLUMNS = [
  'title',
  'description',
  'host_id',
  'scope_id',
  'scope_type',
  'location',
  // Audience + money. The two whose defaults actively contradict the anchor.
  'visibility',
  'status',
  'published_at',
  'price_cents',
  'currency',
  'capacity',
  'venmo_handle',
  'join_mode',
  // Taxonomy + presentation.
  'category',
  'energy_tag',
  'time_zone',
  'cover_image_path',
  'gallery_image_paths',
  'poster_path',
  'theme',
  'details',
  // Placement + tenancy (space_id is trigger-defaulted to ROOT when absent).
  'space_id',
  'host_space_id',
  'domain_id',
  // Where + how to attend.
  'attendance_mode',
  'online_url',
  'venue_name',
  'street',
  'city',
  'region',
  'country',
  'postal_code',
  'geog',
  'hide_address',
  // Provenance (a posted/scanned event's attribution + its poster's edit rights).
  'source',
  'is_demo',
  'posted_by_profile_id',
  'organizer_name',
  'organizer_contact',
] as const

type InheritedColumn = (typeof INHERITED_COLUMNS)[number]

// The anchor SELECT: the occurrence's own identity columns plus everything it inherits.
const ANCHOR_SELECT = [
  'id',
  'starts_at',
  'ends_at',
  'slug',
  'recurrence_type',
  'recurrence_until',
  'is_cancelled',
  'removed_at',
  ...INHERITED_COLUMNS,
].join(', ')

/**
 * PURE. The insert payload for ONE materialised occurrence of `anchor` starting at `start`.
 *
 * Every inherited column is copied verbatim, EXCEPT `geog`: PostgREST hands a PostGIS geography
 * back as an EWKB hex STRING (verified against production), which Postgres accepts straight back
 * on insert — but some setups serialize it as a GeoJSON OBJECT, and writing that object would
 * error and abort the whole batch. So the point is carried only in its round-trippable string
 * form; anything else is dropped, which is exactly today's behaviour (no point at all) rather
 * than a new failure mode.
 */
export function occurrenceRow(
  anchor: Anchor,
  start: Date,
  durationMs: number | null,
): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const col of INHERITED_COLUMNS) {
    const value = anchor[col]
    if (value === undefined) continue
    if (col === 'geog' && value !== null && typeof value !== 'string') continue
    row[col] = value
  }

  row.starts_at = start.toISOString()
  row.ends_at = durationMs != null ? new Date(start.getTime() + durationMs).toISOString() : null
  row.slug = `${anchor.slug}-${start.toISOString().slice(0, 10)}`
  row.parent_event_id = anchor.id
  // A materialised occurrence never itself recurs (a DB CHECK enforces it).
  row.recurrence_type = 'none'
  row.recurrence_until = null

  return row
}

/**
 * PURE. The patch that brings an existing occurrence back in line with its anchor.
 *
 * The same INHERITED_COLUMNS list that builds a NEW occurrence, minus the occurrence's own
 * identity, which `occurrenceRow` sets and this must never touch: `starts_at`, `ends_at`, `slug`
 * and `parent_event_id` are what make one occurrence different from another, and `recurrence_type`
 * / `recurrence_until` are anchor-only (a DB CHECK forbids a materialised occurrence from
 * recurring). Sharing the list is the point: an anchor edit propagates exactly what a fresh
 * occurrence would have inherited, so the two paths cannot disagree about what "same as the
 * anchor" means.
 */
export function propagationPatch(anchor: Anchor): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const col of INHERITED_COLUMNS) {
    const value = anchor[col]
    if (value === undefined) continue
    // Same geog caveat as occurrenceRow: only the round-trippable EWKB-hex form travels.
    if (col === 'geog' && value !== null && typeof value !== 'string') continue
    patch[col] = value
  }
  return patch
}

/**
 * Push an anchor's current details onto its UPCOMING occurrences.
 *
 * Editing a series used to change the anchor alone, so its already-materialised occurrences kept
 * whatever they were minted with. That was visible in production as an anchor titled
 * "Meld - Community Cowork" whose seven children still read "MELD - A Community Cowork", and it is
 * also how a repaired series would silently re-drift the next time anyone edited it.
 *
 * PAST occurrences are left alone on purpose. A past occurrence is the record of an event that
 * already happened; rewriting its price, capacity or venue after the fact would be inventing
 * history rather than correcting it.
 *
 * Best-effort by contract: the caller has already saved the anchor, and a failure here must not
 * fail that save. Returns the number of rows brought back in line, or 0.
 */
export async function propagateAnchorEditsToOccurrences(anchorId: string): Promise<number> {
  const admin = createAdminClient()

  const { data: anchorRow, error: anchorErr } = await admin
    .from('events')
    .select(ANCHOR_SELECT)
    .eq('id', anchorId)
    .is('parent_event_id', null)
    .maybeSingle()
  if (anchorErr || !anchorRow) return 0

  const anchor = anchorRow as unknown as Anchor
  const { data, error } = await admin
    .from('events')
    .update(propagationPatch(anchor) as never)
    .eq('parent_event_id', anchorId)
    .gte('starts_at', new Date().toISOString())
    .select('id')
  // supabase-js RESOLVES with { data, error } on a DB failure rather than throwing, so read it.
  if (error) {
    console.error('[propagateAnchorEditsToOccurrences]', anchorId, error.message)
    return 0
  }
  return (data ?? []).length
}

/** True when an anchor must NOT keep spawning occurrences: cancelled, or moderator-removed.
 *  Without this, cancelling a weekly series stopped nothing — the daily cron kept rolling the
 *  horizon forward and minting fresh, NON-cancelled occurrences of a series the host had ended
 *  (and of a spam series staff had removed, since removal sets is_cancelled too). */
export function anchorIsDormant(anchor: Pick<Anchor, 'is_cancelled' | 'removed_at'>): boolean {
  return !!anchor.is_cancelled || anchor.removed_at != null
}

// Days in a given UTC month (month is 0-indexed; carry handled by the caller).
function daysInUTCMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of `month`.
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

// The occurrence start for an anchor at recurrence step `step` (step 1 = the first
// occurrence after the anchor). Daily/weekly are simple day arithmetic; monthly
// counts whole months from the series start and CLAMPS the day to the target
// month's length, so a day-29/30/31 anchor never overflows (Jan 31 lands on
// Feb 28/29, then Mar 31, Apr 30…, not Mar 3). The clamp source is always the
// ORIGINAL anchor day, computed from the series start each time, so a short month
// never permanently shortens later occurrences.
function occurrenceAt(start: Date, type: RecurrenceType, step: number): Date {
  switch (type) {
    case 'daily': {
      const d = new Date(start)
      d.setUTCDate(d.getUTCDate() + step)
      return d
    }
    case 'weekly': {
      const d = new Date(start)
      d.setUTCDate(d.getUTCDate() + step * 7)
      return d
    }
    case 'monthly': {
      const originalDay = start.getUTCDate()
      const totalMonths = start.getUTCMonth() + step
      const year = start.getUTCFullYear() + Math.floor(totalMonths / 12)
      const month = ((totalMonths % 12) + 12) % 12
      const day = Math.min(originalDay, daysInUTCMonth(year, month))
      return new Date(Date.UTC(
        year, month, day,
        start.getUTCHours(), start.getUTCMinutes(),
        start.getUTCSeconds(), start.getUTCMilliseconds(),
      ))
    }
    case 'none':
    default:
      return new Date(start)
  }
}

// Expand an anchor's occurrence start times (wall-clock-as-UTC-parts, EXCLUDING the anchor itself) up to
// an EXPLICIT upper-bound instant (inclusive), stopping at recurrence_until if set. Pure and
// Date.now()-independent — the seam computeOccurrenceDates (horizon = now + N days) and the .ics feed
// EXDATE helper (bound = the materialization horizon) both delegate here so the series math lives once.
export function expandOccurrenceInstants(
  anchor: Pick<Anchor, 'starts_at' | 'recurrence_type' | 'recurrence_until'>,
  untilInstant: Date,
): Date[] {
  if (anchor.recurrence_type === 'none') return []

  const start = new Date(anchor.starts_at)
  const limit = untilInstant.getTime()
  const seriesEnd = anchor.recurrence_until ? new Date(anchor.recurrence_until) : null

  const dates: Date[] = []
  // Each occurrence is computed FROM the series start (not the previous cursor), so a
  // clamped short-month day can never accumulate drift across the series.
  for (let step = 1; step <= 365; step++) {
    const cursor = occurrenceAt(start, anchor.recurrence_type, step)
    if (cursor.getTime() > limit) break
    if (seriesEnd && cursor > seriesEnd) break
    dates.push(cursor)
  }

  return dates
}

// Compute occurrence start times for an anchor up to the window edge.
// Excludes the anchor itself (it's already in the DB). Stops at
// recurrence_until if set.
export function computeOccurrenceDates(
  anchor: Pick<Anchor, 'starts_at' | 'recurrence_type' | 'recurrence_until'>,
  horizonDays: number = HORIZON_DAYS,
): Date[] {
  if (anchor.recurrence_type === 'none') return []
  const horizon = new Date(Date.now() + horizonDays * 24 * 60 * 60 * 1000)
  return expandOccurrenceInstants(anchor, horizon)
}

// Materialise missing future occurrences for a single anchor. Idempotent.
// Returns the number of rows created.
export async function generateOccurrencesForAnchor(anchorId: string): Promise<number> {
  const admin = createAdminClient()

  const { data: anchorRow, error: anchorErr } = await admin
    .from('events')
    .select(ANCHOR_SELECT)
    .eq('id', anchorId)
    .is('parent_event_id', null)
    .maybeSingle()

  if (anchorErr || !anchorRow) return 0
  const anchor = anchorRow as unknown as Anchor
  if (anchor.recurrence_type === 'none') return 0
  // A cancelled or removed series is over: never mint another occurrence of it.
  if (anchorIsDormant(anchor)) return 0

  const dates = computeOccurrenceDates(anchor)
  if (!dates.length) return 0

  // Find existing occurrences so we don't double-insert. We dedupe on the CALENDAR
  // DAY (YYYY-MM-DD), not the exact getTime(): the per-day slug is unique, so two
  // occurrence rows for the same day can never coexist, and keying on the day is
  // robust to a stored timestamp that differs by milliseconds / a tz round-trip.
  const { data: existing } = await admin
    .from('events')
    .select('starts_at')
    .eq('parent_event_id', anchor.id)

  const existingDays = new Set(
    // starts_at is nullable since drafts (20261191); a child occurrence always has one,
    // but the read is typed nullable, so skip any null defensively.
    (existing ?? []).flatMap((e: { starts_at: string | null }) =>
      e.starts_at ? [new Date(e.starts_at).toISOString().slice(0, 10)] : [],
    ),
  )

  const durationMs = anchor.ends_at
    ? new Date(anchor.ends_at).getTime() - new Date(anchor.starts_at).getTime()
    : null

  // ONE row shape, built by the pure occurrenceRow above, so an occurrence inherits the anchor's
  // audience, price, venue and tenancy instead of silently falling to the column defaults.
  const rows = dates
    .filter((d) => !existingDays.has(d.toISOString().slice(0, 10)))
    .map((d) => occurrenceRow(anchor, d, durationMs))

  if (!rows.length) return 0

  // Upsert (ignore duplicates) on the unique slug so a single pre-existing row —
  // e.g. a concurrent cron run that already materialised this day — never aborts the
  // whole batch. The slug is `${anchor.slug}-${YYYY-MM-DD}`, unique per day, so the
  // happy path (no collisions) inserts exactly the same rows as a plain insert.
  const { error: insErr } = await admin
    .from('events')
    // occurrenceRow builds the payload from INHERITED_COLUMNS, so its static type is a plain
    // record; cast past the generated Insert shape (ADR-246 repo convention). The COLUMN NAMES
    // are the thing under test — lib/event-recurrence.test.ts pins every inherited key.
    .upsert(rows as never, { onConflict: 'slug', ignoreDuplicates: true })
  if (insErr) {
    console.error('[generateOccurrencesForAnchor] insert error:', insErr.message)
    return 0
  }
  return rows.length
}

// Roll occurrences forward for ALL active anchors. Called from the daily
// cron. Returns { anchorCount, occurrencesCreated }.
export async function generateAllOccurrences(): Promise<{
  anchorCount:         number
  occurrencesCreated:  number
}> {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  // A cancelled or moderator-removed anchor is skipped here as well as in the per-anchor path:
  // the cron rolls the horizon forward every day, so without this filter ending a weekly series
  // stopped nothing — a fresh, NON-cancelled occurrence appeared each time the window advanced.
  const { data: anchors } = await admin
    .from('events')
    .select('id, recurrence_until')
    .neq('recurrence_type', 'none')
    .is('parent_event_id', null)
    .eq('is_cancelled', false)
    .is('removed_at', null)
    .or(`recurrence_until.is.null,recurrence_until.gt.${now}`)

  let total = 0
  for (const a of (anchors ?? []) as { id: string }[]) {
    total += await generateOccurrencesForAnchor(a.id)
  }
  return { anchorCount: anchors?.length ?? 0, occurrencesCreated: total }
}
