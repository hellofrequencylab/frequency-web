import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { formatEventWhen, eventInstant } from '@/lib/time/zone'
import type { CalendarEvent } from './item'
import {
  ENTRY_COLS,
  entryToCalendarItem,
  publicUnavailableToItem,
  type EntryFormatters,
  type EntryRow,
  type EntryWrite,
} from './entries'

// PRIVATE CALENDAR ENTRIES, the IO half (ADR-1385). Every staff read and write goes through the
// CALLER'S OWN session, so the table's RLS quad (private.can_write_space_content) is the lock and no
// admin client is involved. The one public read is the space_public_unavailable() projection, which
// returns times and nothing else. Every reader fails safe to [].

/** The table is not in lib/database.types.ts until the migration applies and types regenerate
 *  (ADR-246), so it is reached through this narrow untyped seam. */
type Untyped = {
  from: (t: 'space_calendar_entries') => {
    select: (cols: string) => EntryQuery
    insert: (row: Record<string, unknown>) => { select: (c: string) => { single: () => Promise<{ data: EntryRow | null; error: { message: string } | null }> } }
    update: (row: Record<string, unknown>) => EntryQuery
    delete: () => EntryQuery
  }
  rpc: (
    fn: 'space_public_unavailable',
    args: { p_space_id: string; p_from_day: string; p_to_day: string },
  ) => Promise<{ data: Pick<EntryRow, 'starts_at' | 'ends_at' | 'all_day' | 'time_zone'>[] | null; error: unknown }>
}
type EntryQuery = PromiseLike<{ data: EntryRow[] | null; error: { message: string } | null }> & {
  select: (c: string) => EntryQuery
  eq: (c: string, v: string) => EntryQuery
  lt: (c: string, v: string) => EntryQuery
  gt: (c: string, v: string) => EntryQuery
  order: (c: string, o: { ascending: boolean }) => EntryQuery
  limit: (n: number) => EntryQuery
}

async function db(): Promise<Untyped> {
  return (await createClient()) as unknown as Untyped
}

export const entryFormatters: EntryFormatters = {
  timeLabel: (iso, tz) => formatEventWhen(iso, tz, { style: 'time', withZone: false }),
  whenLabel: (iso, tz) => formatEventWhen(iso, tz, { style: 'full' }),
  dateLabel: (iso, tz) => formatEventWhen(iso, tz, { style: 'date' }),
  instantIso: (iso, tz) => eventInstant(iso, tz)?.toISOString() ?? null,
}

/** The Space's private entries overlapping [fromDay, toDay). RLS returns nothing to a non-editor. */
export async function listSpaceCalendarEntries(spaceId: string, fromDay: string, toDay: string): Promise<EntryRow[]> {
  try {
    const { data, error } = await (await db())
      .from('space_calendar_entries')
      .select(ENTRY_COLS)
      .eq('space_id', spaceId)
      .lt('starts_at', `${toDay}T00:00:00Z`)
      .gt('ends_at', `${fromDay}T00:00:00Z`)
      .order('starts_at', { ascending: true })
      .limit(1000)
    if (error || !data) return []
    return data
  } catch {
    return []
  }
}

/** Private entries as calendar items for the staff calendar. */
export async function listStaffCalendarItems(
  spaceId: string,
  fromDay: string,
  toDay: string,
  opts: { editable: boolean },
): Promise<CalendarEvent[]> {
  const rows = await listSpaceCalendarEntries(spaceId, fromDay, toDay)
  return rows.map((r) => entryToCalendarItem(r, entryFormatters, opts))
}

/** The public "Unavailable" spans for [fromDay, toDay): times only. */
export async function listPublicUnavailableItems(spaceId: string, fromDay: string, toDay: string): Promise<CalendarEvent[]> {
  try {
    const { data, error } = await (await db()).rpc('space_public_unavailable', {
      p_space_id: spaceId,
      p_from_day: fromDay,
      p_to_day: toDay,
    })
    if (error || !data) return []
    return data.map((r, i) => publicUnavailableToItem(r, entryFormatters, i))
  } catch {
    return []
  }
}

export async function insertCalendarEntry(
  spaceId: string,
  row: EntryWrite,
  createdBy: string,
): Promise<{ data: EntryRow } | { error: string }> {
  const { data, error } = await (await db())
    .from('space_calendar_entries')
    .insert({ ...row, space_id: spaceId, created_by: createdBy })
    .select(ENTRY_COLS)
    .single()
  if (error || !data) return { error: 'The entry could not be saved.' }
  return { data }
}

export async function updateCalendarEntryRow(
  spaceId: string,
  entryId: string,
  row: EntryWrite,
): Promise<{ data: true } | { error: string }> {
  const { data, error } = await (await db())
    .from('space_calendar_entries')
    .update(row)
    .eq('space_id', spaceId)
    .eq('id', entryId)
    .select(ENTRY_COLS)
  if (error || !data?.length) return { error: 'The entry could not be saved.' }
  return { data: true }
}

export async function deleteCalendarEntryRow(spaceId: string, entryId: string): Promise<{ data: true } | { error: string }> {
  const { data, error } = await (await db())
    .from('space_calendar_entries')
    .delete()
    .eq('space_id', spaceId)
    .eq('id', entryId)
    .select('id')
  if (error || !data?.length) return { error: 'The entry could not be deleted.' }
  return { data: true }
}
