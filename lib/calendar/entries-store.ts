import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public'
import { formatEventWhen, eventInstant, dayInZone } from '@/lib/time/zone'
import { log } from '@/lib/log'
import type { CalendarEvent } from './item'
import {
  ENTRY_COLS,
  MAX_CANDIDATE_DATES,
  entryItemsInWindow,
  publicUnavailableToItem,
  type EntryFormatters,
  type EntryRow,
  type EntryWrite,
} from './entries'

// PRIVATE CALENDAR ENTRIES, the IO half (ADR-1385). Every staff read and write goes through the
// CALLER'S OWN session, so the table's RLS quad (private.can_write_space_content) is the lock and no
// admin client is involved. The one public read is the space_public_unavailable() projection, which
// returns times and nothing else. Every reader fails safe to [].
//
// 🔴 DELETE IS A TOMBSTONE, AND THAT MAKES `removed_at is null` A READER'S JOB (LIVE-536).
// On 2026-09-28 an operator deleted one occurrence of a repeating Pencil ("Craft Night") and lost the
// whole series for good: a repeating entry is ONE ROW (PROG-CAL5), and the delete below was a hard
// `.delete()` against a table with no tombstone column, so there was nothing left to recover from.
// `deleteCalendarEntryRow` now STAMPS `removed_at` (migration 20270345008600), which moves the burden
// onto every reader in this file: a removed row is still in the table, still inside the RLS quad, and
// still returned by any query that does not say otherwise. A reader that forgets the filter shows an
// operator a date they deleted, which is worse than the bug the tombstone fixes. So every select here
// carries `.is('removed_at', null)`, and so does every write that must not resurrect or silently edit
// a removed row. The SQL-side readers (space_public_unavailable, keep_pencil_date) filter in the
// migration; the two admin-client readers outside this file are lib/spaces/booking.ts and
// app/calendar/private/[token]/route.ts.

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
    (
      fn: 'split_calendar_series',
      args: { p_space_id: string; p_entry_id: string; p_day: string; p_override: Record<string, unknown> },
    ): Promise<{ data: string | null; error: unknown }>
  }
}
type EntryQuery = PromiseLike<{ data: EntryRow[] | null; error: { message: string } | null }> & {
  select: (c: string) => EntryQuery
  eq: (c: string, v: string) => EntryQuery
  neq: (c: string, v: string) => EntryQuery
  is: (c: string, v: null) => EntryQuery
  not: (c: string, op: 'is', v: null) => EntryQuery
  lt: (c: string, v: string) => EntryQuery
  gt: (c: string, v: string) => EntryQuery
  order: (c: string, o: { ascending: boolean }) => EntryQuery
  limit: (n: number) => EntryQuery
}

async function db(): Promise<Untyped> {
  return (await createClient()) as unknown as Untyped
}

const entryFormatters: EntryFormatters = {
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
 *  became is, and `findEntryClashes` already reads events separately.
 *
 *  REPEATING PENCILS (PROG-CAL5) are a second read, merged in: a series is ONE row anchored on its
 *  first date, so a biweekly Pencil started in January overlaps a March window on none of its
 *  columns and the overlap filter alone would never show it. Every row carrying a rule and starting
 *  before the window's end is fetched too, and lib/calendar/pencil-series.ts decides which of its
 *  landings fall inside the window. The rows come back as MASTERS, unexpanded, so a caller that
 *  wants occurrences expands them and a caller that wants the row (the drawer, a clash check) has it. */
export async function listSpaceCalendarEntries(spaceId: string, fromDay: string, toDay: string): Promise<EntryRow[]> {
  try {
    const client = await db()
    const [overlap, repeating] = await Promise.all([
      client
        .from('space_calendar_entries')
        .select(ENTRY_COLS)
        .eq('space_id', spaceId)
        .is('removed_at', null)
        .is('published_event_id', null)
        .lt('starts_at', `${toDay}T00:00:00Z`)
        .gt('ends_at', `${fromDay}T00:00:00Z`)
        .order('starts_at', { ascending: true })
        .limit(1000),
      client
        .from('space_calendar_entries')
        .select(ENTRY_COLS)
        .eq('space_id', spaceId)
        .is('removed_at', null)
        .is('published_event_id', null)
        .not('recurrence_rule', 'is', null)
        .lt('starts_at', `${toDay}T00:00:00Z`)
        .order('starts_at', { ascending: true })
        .limit(1000),
    ])
    if (overlap.error || !overlap.data) return []
    // A read failure on the series half must not read as "no series": the overlap rows are still
    // right, but a repeating Pencil silently missing from March is exactly the invisible regression
    // AGENTS.md names, so it goes to the log where a gate can see it.
    if (repeating.error || !repeating.data) {
      log.error('calendar.entries.series_read_failed', { space_id: spaceId, from_day: fromDay, to_day: toDay })
      return overlap.data
    }
    const seen = new Set<string>()
    const merged: EntryRow[] = []
    for (const r of [...overlap.data, ...repeating.data]) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      merged.push(r)
    }
    return merged.sort((a, b) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0))
  } catch {
    return []
  }
}

/** Private entries as calendar items for the staff calendar. A repeating Pencil arrives as one item
 *  per occurrence inside the window, each carrying the master's id and its own day (PROG-CAL5). */
export async function listStaffCalendarItems(
  spaceId: string,
  fromDay: string,
  toDay: string,
  opts: { editable: boolean },
): Promise<CalendarEvent[]> {
  const rows = await listSpaceCalendarEntries(spaceId, fromDay, toDay)
  const now = dayInZone(new Date())
  return rows.flatMap((r) => entryItemsInWindow(r, entryFormatters, { ...opts, now }, { fromDay, toDay }))
}

/** The public "Unavailable" spans for [fromDay, toDay): times only. */
export async function listPublicUnavailableItems(spaceId: string, fromDay: string, toDay: string): Promise<CalendarEvent[]> {
  try {
    // The cookie-free anon client (lib/supabase/public.ts): the RPC is granted to anon and answers the same
    // for every caller, and a cached, viewer-free render (a Space website, LIVE-872) may not read cookies.
    const { data, error } = await (createPublicClient() as unknown as Untyped).rpc('space_public_unavailable', {
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
      .is('removed_at', null)
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
      .is('removed_at', null)
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
    // A removed date is not editable: an open drawer whose row was deleted elsewhere must fail with
    // "could not be saved" rather than quietly write fields onto a tombstone (LIVE-536).
    .is('removed_at', null)
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
    // A removed Pencil cannot become a Production: it is not on the calendar (LIVE-536).
    .is('removed_at', null)
    .select('id')
  if (error || !data?.length) return { error: 'That date could not be marked as published.' }
  return { data: true }
}

/** THE STORED SKIP (PROG-CAL5). Writes the whole `exception_dates` list of one repeating entry and
 *  nothing else on the row, so a skip taken from an occurrence chip never races the drawer's other
 *  fields. The list arrives already normalised (lib/calendar/pencil-series.ts); the caller's session
 *  and the table's operator quad decide whether the write lands. */
export async function setEntryExceptionDates(
  spaceId: string,
  entryId: string,
  dates: string[],
): Promise<{ data: true } | { error: string }> {
  const { data, error } = await (await db())
    .from('space_calendar_entries')
    .update({ exception_dates: dates })
    .eq('space_id', spaceId)
    .eq('id', entryId)
    .is('removed_at', null)
    .select('id')
  if (error || !data?.length) return { error: 'That date could not be skipped.' }
  return { data: true }
}

/** THE SPLIT (LIVE-534). One occurrence of a repeating entry becomes its own one-off row carrying the
 *  edited values, and the series skips that day, in ONE statement (public.split_calendar_series,
 *  SECURITY INVOKER, so RLS still decides). Two writes that land together or not at all: a stamped
 *  skip with no override is a date that silently vanished, and an override with no skip is the same
 *  date drawn twice. The rule and the skips are the SERIES', so they are stripped from the override
 *  here and refused by name in the function; the override is a one-off by construction. */
export async function splitCalendarSeriesRow(
  spaceId: string,
  entryId: string,
  dayKey: string,
  override: EntryWrite,
): Promise<{ data: string } | { error: string }> {
  const { recurrence_rule: _rule, exception_dates: _skips, ...oneOff } = override
  try {
    const { data, error } = await (await db()).rpc('split_calendar_series', {
      p_space_id: spaceId,
      p_entry_id: entryId,
      p_day: dayKey,
      p_override: oneOff,
    })
    if (error || !data) return { error: 'That date could not be changed on its own.' }
    return { data }
  } catch {
    return { error: 'That date could not be changed on its own.' }
  }
}

/** THE DELETE IS A TOMBSTONE (LIVE-536, owner ruling 2026-09-28). This was a hard `.delete()`, and it
 *  is what cost the owner a repeating Pencil ("Craft Night") permanently: a series is ONE ROW, so
 *  deleting any occurrence destroyed every occurrence, and the table carried no tombstone column to
 *  recover from. Now it stamps `removed_at` (+ `removed_by`, the actor the action already has) and the
 *  row stays, so the date can be brought back with `set removed_at = null`.
 *
 *  What makes that honest rather than a hidden row is the FILTER on every reader in this file and in
 *  the three readers outside it (lib/calendar/plans-store.ts, lib/spaces/booking.ts,
 *  app/calendar/private/[token]/route.ts) plus the two SQL readers in the migration. The `removed_at
 *  is null` guard here is what keeps a SECOND delete from overwriting the first removal's timestamp:
 *  an already-removed date reports the same "could not be deleted" a hard delete of a missing row did,
 *  and its original tombstone survives.
 *
 *  Runs on the CALLER'S session like every other write here, so the operator quad's UPDATE policy is
 *  the lock. The table's DELETE policy is untouched and unused, kept for a future purge. */
export async function deleteCalendarEntryRow(
  spaceId: string,
  entryId: string,
  removedBy: string | null = null,
): Promise<{ data: true } | { error: string }> {
  const { data, error } = await (await db())
    .from('space_calendar_entries')
    .update({ removed_at: new Date().toISOString(), removed_by: removedBy })
    .eq('space_id', spaceId)
    .eq('id', entryId)
    .is('removed_at', null)
    .select('id')
  if (error || !data?.length) return { error: 'The entry could not be deleted.' }
  return { data: true }
}
