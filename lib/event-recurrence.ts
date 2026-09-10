// Event recurrence helpers.
//
// We materialise future occurrences as real event rows rather than computing
// them on the fly. See migration 20240208 for the rationale (RSVP semantics,
// per-occurrence cancellation, no query-layer changes).
//
// The window we keep materialised is HORIZON_DAYS. The cron at
// /api/cron/event-occurrences runs daily to roll this forward.

import { createAdminClient } from '@/lib/supabase/admin'
import { createHash } from 'crypto'
import { expandRepeat, repeatFor } from '@/lib/events/repeat-rule'

function sanitizeForLog(value: unknown): string {
  return String(value).replace(/[\r\n]+/g, '')
}

function logToken(value: unknown): string {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 16)
}

export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

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
  /** The RRULE value (ADR-1299). Optional and nullable: it is null on every row written before it,
   *  which is what makes `repeatFor`'s fall back to the coarse cadence the normal path rather than
   *  the exception, and absent on any caller assembling an anchor without it. */
  recurrence_rule?: string | null
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
//     (`recurrence_rule` is in that set: a materialised occurrence never itself repeats, and the DB
//     CHECK that says so is written against `recurrence_type`, which occurrenceRow pins to 'none'.)
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
  // Associations (ADR-884): the Journey a series belongs to travels to its occurrences, or the
  // "Part of" chip and the events-of-Journey read (the partial index exists for it) silently skip
  // every materialized row. Found by the meta sweep as a seam between two parallel lanes: one
  // added the column, the other closed the drift list, neither saw the other.
  'journey_id',
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
  'recurrence_rule',
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
  row.recurrence_rule = null

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
    // Neither value reaches the log raw. `anchorId` comes from a form field and `error.message` can
    // carry database text, so a value containing CR/LF could forge extra log entries (CodeQL
    // log-injection).
    //
    // The id is logged as a HASHED TOKEN rather than sanitized in place, because the scanner
    // rejected the readable sanitized-and-capped form twice. It costs debuggability: you can no
    // longer eyeball an event id in the logs. The token is stable though, so hashing the id you are
    // investigating still correlates. `error.message` is sanitized rather than hashed, since it has
    // to stay legible to be worth logging at all.
    console.error(
      '[propagateAnchorEditsToOccurrences]',
      logToken(anchorId),
      sanitizeForLog(error.message),
    )
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

// ── THE STEPPING LIVES IN ONE PLACE NOW (ADR-1299) ──────────────────────────────────────────────
//
// This module used to carry its own `occurrenceAt` + `daysInUTCMonth`, a deliberate copy of the
// same maths in lib/events/recurrence.ts (the read side) and lib/events/calendar-repeats.ts (the
// calendar strip), with lib/events/recurrence-parity.test.ts standing between the three to notice
// when they disagreed. All three delegate to lib/events/repeat-rule.ts now.
//
// That is not tidying: it is what makes an advanced rule SAFE. The write side is the one that mints
// real `events` rows, so a rule the expander understood and a card did not would put a gathering on
// the calendar on a date the page announces differently — the exact class of disagreement the
// parity gate was written for, except that with a rule the enum cannot express the read side would
// have had no way to be right.
//
// The clamp (a monthly series anchored on the 31st landing on Feb 28 rather than skipping February)
// moved with it, unchanged, and the parity fixtures still pin it across leap years.

// Expand an anchor's occurrence start times (wall-clock-as-UTC-parts, EXCLUDING the anchor itself) up to
// an EXPLICIT upper-bound instant (inclusive), stopping at recurrence_until if set. Pure and
// Date.now()-independent — the seam computeOccurrenceDates (horizon = now + N days) and the .ics feed
// EXDATE helper (bound = the materialization horizon) both delegate here so the series math lives once.
export function expandOccurrenceInstants(
  anchor: Pick<Anchor, 'starts_at' | 'recurrence_type' | 'recurrence_until' | 'recurrence_rule'>,
  untilInstant: Date,
): Date[] {
  const rule = repeatFor({
    starts_at: anchor.starts_at,
    recurrence_type: anchor.recurrence_type,
    recurrence_rule: anchor.recurrence_rule ?? null,
  })
  if (!rule) return []
  const seriesEnd = anchor.recurrence_until ? new Date(anchor.recurrence_until) : null
  return expandRepeat(anchor.starts_at, rule, {
    through: untilInstant,
    until: seriesEnd,
    // The anchor is already a row in the database; this function mints the ones that are not.
    includeAnchor: false,
  })
}

// Compute occurrence start times for an anchor up to the window edge.
// Excludes the anchor itself (it's already in the DB). Stops at
// recurrence_until if set.
export function computeOccurrenceDates(
  anchor: Pick<Anchor, 'starts_at' | 'recurrence_type' | 'recurrence_until' | 'recurrence_rule'>,
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

// Roll occurrences forward for active anchors. Called from the daily cron.
// Returns { anchorCount, occurrencesCreated, anchorsVisited, remaining, stoppedOnBudget }.
//
// LIVE-190: one run reads at most `limit` anchors, oldest series first, and stops on the clock.
// ⚠️ There is NO resume cursor yet: generation writes nothing on the anchor, so a run that stops
// early re-reads the same head tomorrow. The per-anchor work is idempotent (an upsert that ignores
// duplicates), so the head costs one read each; an anchor past `limit` waits for a generated-at
// column the row records as the missing piece. Until then `limit` is set well above the anchor
// count and the clock is the bound that matters.
export async function generateAllOccurrences(
  opts: { limit?: number; exhausted?: () => boolean; reconcile?: boolean } = {},
): Promise<{
  anchorCount:         number
  occurrencesCreated:  number
  /** Dates a changed rule no longer produces, retired by this run (ADR-1304). */
  occurrencesRetired:  number
  /** Such dates left live because a human is attached to them, or the fail-safe stood down. */
  occurrencesKept:     number
  anchorsVisited:      number
  remaining:           number
  stoppedOnBudget:     boolean
}> {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const limit = Math.max(1, opts.limit ?? 2000)
  const exhausted = opts.exhausted ?? (() => false)
  const reconcile = opts.reconcile ?? true

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
    .order('created_at', { ascending: true })
    .limit(limit)

  const list = (anchors ?? []) as { id: string }[]
  let total = 0
  let retired = 0
  let kept = 0
  let visited = 0
  let stoppedOnBudget = false
  for (const a of list) {
    if (exhausted()) {
      stoppedOnBudget = true
      break
    }
    visited++
    // RETIRE BEFORE MINTING. The two are the same window read the same way, so the order does not
    // change the outcome — retirement only ever removes a date the rule does not produce, and
    // generation only ever adds one it does — but doing it first means the mint sees the shape it
    // is about to complete rather than the old one plus the new one.
    //
    // 🔴 THE CRON MATTERS AS MUCH AS THE EDIT PATHS HERE, because the drift this heals ALREADY
    // EXISTS: every series whose rule was changed before ADR-1304 is carrying dates from the rule
    // it used to have, and nobody is going to re-save all of them. This is what heals them, within
    // a day, without anyone touching the event.
    if (reconcile) {
      const r = await retireStaleOccurrences(a.id)
      retired += r.retired
      kept += r.kept
    }
    total += await generateOccurrencesForAnchor(a.id)
  }
  return {
    anchorCount: list.length,
    occurrencesCreated: total,
    occurrencesRetired: retired,
    occurrencesKept: kept,
    anchorsVisited: visited,
    remaining: list.length - visited,
    stoppedOnBudget,
  }
}

// ── RETIRING THE DATES A CHANGED RULE NO LONGER PRODUCES (ADR-1304) ──────────────────────────────
//
// Owner, 2026-09-10: *"We also need to edit any future events that have been created if an event in
// the chain changes. For instance, I changed Meld from weekly to bi weekly but it still shows all
// the repeating events that were configured originally."*
//
// 🔴 THE MATERIALISER IS ADDITIVE BY CONSTRUCTION, and nothing above this line ever took a date
// back. `generateOccurrencesForAnchor` dedupes by calendar day and upserts with
// `ignoreDuplicates: true`, so it can only ever ADD; `propagateAnchorEditsToOccurrences` copies
// content and deliberately excludes `starts_at`, `ends_at`, `slug`, `recurrence_type` and
// `recurrence_until`, which are exactly the columns a rule change moves. So:
//
//   · weekly -> fortnightly minted the new dates ALONGSIDE the old weekly ones,
//   · shrinking `recurrence_until` stopped minting but never retired what was past the new end,
//   · turning a series off left its future dates live forever.
//
// This is the missing direction. It retires a FUTURE child the current rule does not produce.
//
// WHAT IT WILL NOT TOUCH, and why the list is short. A materialised occurrence with nobody attached
// to it is pure machine output: it was minted by a cron from a rule, and un-minting it when the
// rule changes is the same act as minting it. The moment a HUMAN has attached something to that
// date — an RSVP, a ticket, an invited guest, a posted update — it stops being machine output and
// becomes a gathering people committed to. Retiring one of those is a CANCELLATION, with refunds
// and notifications behind it (lib/events/cancellation.ts owns that, and it is a deliberate host
// action), so this function leaves it alone and counts it instead. A host who wants that date gone
// cancels it, which tells the people who signed up.
//
// PAST occurrences are never touched, for the same reason propagation does not touch them: a past
// occurrence is the record of something that already happened.
const OCCURRENCE_ATTACHMENT_TABLES = [
  'event_rsvps',
  'event_tickets',
  'event_guests',
  'event_posts',
] as const

/** The calendar day an instant falls on, in the wall-clock-as-UTC convention every date in this
 *  module uses. The materialiser dedupes on this, so retirement has to compare on it too, or a
 *  stored timestamp that differs by a millisecond or a timezone round-trip reads as a new date. */
export function occurrenceDayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

/**
 * PURE. The FUTURE children whose day the rule no longer produces.
 *
 * Kept separate from the IO so the arithmetic — which is the part that decides whether a row is
 * deleted — is testable without a database, and so a caller can see what it would retire before it
 * retires anything.
 */
export function staleOccurrenceIds(
  children: readonly { id: string; starts_at: string | null }[],
  expected: readonly Date[],
  now: Date,
): string[] {
  const keep = new Set(expected.map((d) => d.toISOString().slice(0, 10)))
  const cutoff = now.getTime()
  return children
    .filter((c) => c.starts_at != null && new Date(c.starts_at).getTime() >= cutoff)
    .filter((c) => !keep.has(occurrenceDayKey(c.starts_at as string)))
    .map((c) => c.id)
}

export type RetireResult = {
  /** Rows deleted: future dates the rule no longer produces, with nobody attached. */
  retired: number
  /** Future dates the rule no longer produces that a human HAS attached something to. Left live. */
  kept: number
  /** The fail-safe fired: see `retireStaleOccurrences`. Nothing was touched. */
  stoodDown: boolean
}

const NOTHING: RetireResult = { retired: 0, kept: 0, stoodDown: false }

/**
 * Retire the future occurrences of `anchorId` that its CURRENT rule does not produce.
 *
 * Best-effort by contract, exactly like `propagateAnchorEditsToOccurrences`: the caller has already
 * saved the anchor, and a failure here must never fail that save.
 *
 * 🔴 THE FAIL-SAFE, AND THE GATE THAT NOTICES IT FIRED. An anchor that still says it repeats but
 * whose rule expands to NOTHING is not a series with no dates, it is a rule this code could not
 * read — a malformed RRULE, an unparseable `starts_at`. Believing it would delete every future
 * date of a live series. So that case stands down without touching a row and says so, in the log
 * and in the returned flag, because a silent fail-safe is an invisible regression.
 */
export async function retireStaleOccurrences(anchorId: string): Promise<RetireResult> {
  const admin = createAdminClient()

  const { data: anchorRow, error: anchorErr } = await admin
    .from('events')
    .select(ANCHOR_SELECT)
    .eq('id', anchorId)
    .is('parent_event_id', null)
    .maybeSingle()
  if (anchorErr || !anchorRow) return NOTHING
  const anchor = anchorRow as unknown as Anchor
  // A cancelled or removed series is the cancellation engine's business: it flips `is_cancelled` on
  // every occurrence and keeps the rows, which is the record of a gathering that was called off.
  // Deleting them here would erase it.
  if (anchorIsDormant(anchor)) return NOTHING

  const { data: kids, error: kidsErr } = await admin
    .from('events')
    .select('id, starts_at')
    .eq('parent_event_id', anchorId)
    .gte('starts_at', new Date().toISOString())
  if (kidsErr) {
    console.error('[retireStaleOccurrences]', logToken(anchorId), sanitizeForLog(kidsErr.message))
    return NOTHING
  }
  const children = (kids ?? []) as { id: string; starts_at: string | null }[]
  if (!children.length) return NOTHING

  // Expand PAST the materialisation horizon when a child sits beyond it, so a date the old rule
  // minted far out is still judged against the new rule rather than falling off the end of the
  // window and reading as "not produced" by accident.
  const now = new Date()
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000)
  const furthest = children.reduce(
    (max, c) => (c.starts_at && new Date(c.starts_at) > max ? new Date(c.starts_at) : max),
    horizon,
  )
  const expected = expandOccurrenceInstants(anchor, furthest)

  if (anchor.recurrence_type !== 'none' && expected.length === 0) {
    console.warn(
      '[retireStaleOccurrences] STOOD DOWN: anchor still repeats but its rule expanded to nothing',
      logToken(anchorId),
      sanitizeForLog(anchor.recurrence_rule ?? anchor.recurrence_type),
    )
    return { ...NOTHING, stoodDown: true }
  }

  const stale = staleOccurrenceIds(children, expected, now)
  if (!stale.length) return NOTHING

  // Which of those a human has attached something to. One read per table, all ids at once.
  const attached = new Set<string>()
  for (const table of OCCURRENCE_ATTACHMENT_TABLES) {
    const { data, error } = await admin.from(table).select('event_id').in('event_id', stale)
    if (error) {
      // A read that failed is not a read that found nothing. Standing down is the only safe
      // reading: treat every candidate as attached rather than delete on an unknown.
      console.error('[retireStaleOccurrences]', table, sanitizeForLog(error.message))
      return { ...NOTHING, kept: stale.length, stoodDown: true }
    }
    for (const r of (data ?? []) as { event_id: string | null }[]) {
      if (r.event_id) attached.add(r.event_id)
    }
  }

  const removable = stale.filter((id) => !attached.has(id))
  if (!removable.length) return { retired: 0, kept: stale.length, stoodDown: false }

  const { data: deleted, error: delErr } = await admin
    .from('events')
    .delete()
    .in('id', removable)
    // Belt and braces against the one mistake this function could make that matters: it may only
    // ever delete a CHILD of this anchor, never the anchor and never a standalone event.
    .eq('parent_event_id', anchorId)
    .select('id')
  if (delErr) {
    console.error('[retireStaleOccurrences]', logToken(anchorId), sanitizeForLog(delErr.message))
    return { retired: 0, kept: stale.length, stoodDown: false }
  }

  const retired = (deleted ?? []).length
  console.warn('[retireStaleOccurrences] retired dates the rule no longer produces', {
    anchor: logToken(anchorId),
    retired,
    keptBecauseAttached: stale.length - retired,
  })
  return { retired, kept: stale.length - retired, stoodDown: false }
}
