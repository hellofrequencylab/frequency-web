import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { formatEventWhen, eventInstant, dayInZone } from '@/lib/time/zone'
import type { CalendarEvent } from './item'
import {
  ENTRY_COLS,
  MAX_CANDIDATE_DATES,
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
    insert: (rows: Record<string, unknown>[]) => { select: (c: string) => PromiseLike<{ data: EntryRow[] | null; error: { message: string } | null }> }
    update: (row: Record<string, unknown>) => EntryQuery
    delete: () => EntryQuery
  }
  rpc: {
    (
      fn: 'space_public_unavailable',
      args: { p_space_id: string; p_from_day: string; p_to_day: string },
    ): Promise<{ data: Pick<EntryRow, 'starts_at' | 'ends_at' | 'all_day' | 'time_zone'>[] | null; error: unknown }>
    (fn: 'keep_pencil_date', args: { p_space_id: string; p_entry_id: string }): Promise<{ data: number | null; error: unknown }>
  }
}
type EntryQuery = PromiseLike<{ data: EntryRow[] | null; error: { message: string } | null }> & {
  select: (c: string) => EntryQuery
  eq: (c: string, v: string) => EntryQuery
  neq: (c: string, v: string) => EntryQuery
  is: (c: string, v: null) => EntryQuery
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

/** The Space's private entries overlapping [fromDay, toDay), EXCLUDING dates that already became a
 *  Production. RLS returns nothing to a non-editor.
 *
 *  🔴 THE `published_event_id is null` FILTER IS THE WHOLE DUPLICATE RULE (PROG-CAL3, ADR-1386).
 *  Publishing used to DELETE the Pencil, taking its description, Team notes and hold with it, and
 *  the reason it did is right here: `lib/calendar/admin-calendar.ts` merges events and entries as
 *  two separate arrays, so a Pencil that merely survived would draw a second card beside its own
 *  event on the same day — the duplicate ADR-1386 forbids. Filtering it out of the ITEM list keeps
 *  the row (as history, and as the event's back-link) while the event card takes its place, which
 *  is what "the Pencil's calendar card becomes the event card" actually requires.
 *
 *  Clash-checking wants the same set: a retired date is not competing for the time, the event it
 *  became is, and `findEntryClashes` already reads events separately. */
export async function listSpaceCalendarEntries(spaceId: string, fromDay: string, toDay: string): Promise<EntryRow[]> {
  try {
    const { data, error } = await (await db())
      .from('space_calendar_entries')
      .select(ENTRY_COLS)
      .eq('space_id', spaceId)
      .is('published_event_id', null)
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
  const now = dayInZone(new Date())
  return rows.map((r) => entryToCalendarItem(r, entryFormatters, { ...opts, now }))
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

/** One entry of this Space, or null when it does not exist or the caller may not read it. */
export async function getCalendarEntryRow(spaceId: string, entryId: string): Promise<EntryRow | null> {
  try {
    const { data, error } = await (await db())
      .from('space_calendar_entries')
      .select(ENTRY_COLS)
      .eq('space_id', spaceId)
      .eq('id', entryId)
      .limit(1)
    return error || !data?.length ? null : data[0]
  } catch {
    return null
  }
}

/** How many entries share this candidate-date group (the entry itself included). */
export async function countOptionGroup(spaceId: string, group: string): Promise<number> {
  try {
    const { data, error } = await (await db())
      .from('space_calendar_entries')
      .select('id')
      .eq('space_id', spaceId)
      .eq('option_group', group)
      .limit(MAX_CANDIDATE_DATES + 1)
    return error || !data ? 0 : data.length
  } catch {
    return 0
  }
}

/** Insert one entry, or a pencil and its candidate dates sharing one option_group. `group` joins the
 *  rows to an existing group (dates added while editing); otherwise several rows get a fresh one. */
export async function insertCalendarEntries(
  spaceId: string,
  rows: EntryWrite[],
  createdBy: string,
  group: string | null = null,
): Promise<{ data: EntryRow[] } | { error: string }> {
  if (rows.length === 0) return { error: 'Nothing to save.' }
  group = group ?? (rows.length > 1 ? crypto.randomUUID() : null)
  const { data, error } = await (await db())
    .from('space_calendar_entries')
    .insert(rows.map((r) => ({ ...r, space_id: spaceId, created_by: createdBy, option_group: group })))
    .select(ENTRY_COLS)
  if (error || !data?.length) return { error: 'The entry could not be saved.' }
  return { data }
}

/** Keep one candidate date of a pencil: its siblings are removed and its group cleared in ONE database
 *  statement (public.keep_pencil_date, SECURITY INVOKER, so RLS still decides). */
export async function keepPencilDateRow(spaceId: string, entryId: string): Promise<{ data: number } | { error: string }> {
  try {
    const { data, error } = await (await db()).rpc('keep_pencil_date', { p_space_id: spaceId, p_entry_id: entryId })
    if (error) return { error: 'The other dates could not be removed.' }
    return { data: data ?? 0 }
  } catch {
    return { error: 'The other dates could not be removed.' }
  }
}

export async function updateCalendarEntryRow(
  spaceId: string,
  entryId: string,
  row: EntryWrite,
  /** Set when dates added while editing start a candidate group around this entry. */
  optionGroup?: string,
): Promise<{ data: true } | { error: string }> {
  const { data, error } = await (await db())
    .from('space_calendar_entries')
    .update(optionGroup ? { ...row, option_group: optionGroup } : row)
    .eq('space_id', spaceId)
    .eq('id', entryId)
    .select(ENTRY_COLS)
  if (error || !data?.length) return { error: 'The entry could not be saved.' }
  return { data: true }
}

/** THE PENCIL BECOMES ITS PRODUCTION (PROG-CAL3, ADR-1386). Called once, by the publish seam in
 *  app/(main)/events/actions.ts, in place of the hard delete that used to sit there.
 *
 *  Two columns, one statement: `published_event_id` retires the date from the item list and
 *  back-links the event it became, and `stage` moves it to `production` so the Projects kanban and
 *  every stage reader agree with the Plan. The table's BEFORE trigger derives `status` from the
 *  stage (ADR-1388 §2), so status is deliberately NOT written here — two writers for one fact is
 *  how the form and the row came to disagree in the first place.
 *
 *  Runs on the CALLER'S session like every other entry write, so the operator quad on
 *  space_calendar_entries is still the lock: a caller who cannot edit this Space's calendar
 *  updates nothing and gets the error, even though the event insert above it ran as the service
 *  role. `kind = 'pencil'` is asserted in the filter as well as by the table's check constraint. */
export async function retirePencilToEvent(
  spaceId: string,
  entryId: string,
  eventId: string,
): Promise<{ data: true } | { error: string }> {
  const { data, error } = await (await db())
    .from('space_calendar_entries')
    .update({ published_event_id: eventId, stage: 'production' })
    .eq('space_id', spaceId)
    .eq('id', entryId)
    .eq('kind', 'pencil')
    .select('id')
  if (error || !data?.length) return { error: 'That date could not be marked as published.' }
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
