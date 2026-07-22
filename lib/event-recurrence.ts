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
    .select(
      'id, title, description, host_id, scope_id, scope_type, location, ' +
      'starts_at, ends_at, slug, recurrence_type, recurrence_until'
    )
    .eq('id', anchorId)
    .is('parent_event_id', null)
    .maybeSingle()

  if (anchorErr || !anchorRow) return 0
  const anchor = anchorRow as unknown as Anchor
  if (anchor.recurrence_type === 'none') return 0

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
    (existing ?? []).map((e: { starts_at: string }) =>
      new Date(e.starts_at).toISOString().slice(0, 10),
    ),
  )

  const durationMs = anchor.ends_at
    ? new Date(anchor.ends_at).getTime() - new Date(anchor.starts_at).getTime()
    : null

  const rows = dates
    .filter((d) => !existingDays.has(d.toISOString().slice(0, 10)))
    .map((d) => {
      const endsAt = durationMs != null
        ? new Date(d.getTime() + durationMs).toISOString()
        : null
      return {
        title:           anchor.title,
        description:     anchor.description,
        host_id:         anchor.host_id,
        scope_id:        anchor.scope_id,
        scope_type:      anchor.scope_type,
        location:        anchor.location,
        starts_at:       d.toISOString(),
        ends_at:         endsAt,
        slug:            `${anchor.slug}-${d.toISOString().slice(0, 10)}`,
        parent_event_id: anchor.id,
        recurrence_type: 'none',
      }
    })

  if (!rows.length) return 0

  // Upsert (ignore duplicates) on the unique slug so a single pre-existing row —
  // e.g. a concurrent cron run that already materialised this day — never aborts the
  // whole batch. The slug is `${anchor.slug}-${YYYY-MM-DD}`, unique per day, so the
  // happy path (no collisions) inserts exactly the same rows as a plain insert.
  const { error: insErr } = await admin
    .from('events')
    .upsert(rows, { onConflict: 'slug', ignoreDuplicates: true })
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

  const { data: anchors } = await admin
    .from('events')
    .select('id, recurrence_until')
    .neq('recurrence_type', 'none')
    .is('parent_event_id', null)
    .or(`recurrence_until.is.null,recurrence_until.gt.${now}`)

  let total = 0
  for (const a of (anchors ?? []) as { id: string }[]) {
    total += await generateOccurrencesForAnchor(a.id)
  }
  return { anchorCount: anchors?.length ?? 0, occurrencesCreated: total }
}
