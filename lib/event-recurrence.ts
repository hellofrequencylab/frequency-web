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

// Advance a date by one recurrence step.
function nextOccurrence(date: Date, type: RecurrenceType): Date {
  const next = new Date(date)
  switch (type) {
    case 'daily':
      next.setUTCDate(next.getUTCDate() + 1)
      return next
    case 'weekly':
      next.setUTCDate(next.getUTCDate() + 7)
      return next
    case 'monthly':
      next.setUTCMonth(next.getUTCMonth() + 1)
      return next
    case 'none':
    default:
      return next
  }
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
  const seriesEnd = anchor.recurrence_until
    ? new Date(anchor.recurrence_until)
    : null

  const dates: Date[] = []
  let cursor = nextOccurrence(new Date(anchor.starts_at), anchor.recurrence_type)
  let safetyBound = 0

  while (cursor <= horizon && safetyBound < 365) {
    if (seriesEnd && cursor > seriesEnd) break
    dates.push(cursor)
    cursor = nextOccurrence(cursor, anchor.recurrence_type)
    safetyBound++
  }

  return dates
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

  // Find existing occurrences so we don't double-insert.
  const { data: existing } = await admin
    .from('events')
    .select('starts_at')
    .eq('parent_event_id', anchor.id)

  const existingTimestamps = new Set(
    (existing ?? []).map((e: { starts_at: string }) =>
      new Date(e.starts_at).getTime(),
    ),
  )

  const durationMs = anchor.ends_at
    ? new Date(anchor.ends_at).getTime() - new Date(anchor.starts_at).getTime()
    : null

  const rows = dates
    .filter((d) => !existingTimestamps.has(d.getTime()))
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

  const { error: insErr } = await admin.from('events').insert(rows)
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
