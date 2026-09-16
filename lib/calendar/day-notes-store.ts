import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { DAY_NOTE_COLS, dayNoteFromRow, type DayNote, type DayNoteWrite } from './day-notes'

// DAY NOTES, the IO half (ADR-1386). Read and written on the caller's own session: RLS returns public
// notes to anyone and team notes to the Space's editors, and only editors may write.

type Row = { id: string; label: string; weekdays: number[] | null; starts_on: string | null; ends_on: string | null; visibility: string }
type Q = PromiseLike<{ data: Row[] | null; error: { message: string } | null }> & {
  select: (c: string) => Q
  eq: (c: string, v: string) => Q
  order: (c: string, o: { ascending: boolean }) => Q
}
type Untyped = {
  from: (t: 'space_calendar_day_notes') => {
    select: (c: string) => Q
    insert: (r: Record<string, unknown>) => Q
    update: (r: Record<string, unknown>) => Q
    delete: () => Q
  }
}

type Result = { data: true } | { error: string }

async function db(): Promise<Untyped> {
  return (await createClient()) as unknown as Untyped
}

/** A Space's day notes the caller may see; `publicOnly` for the public Calendar tab. */
export async function listDayNotes(spaceId: string, opts: { publicOnly?: boolean } = {}): Promise<DayNote[]> {
  try {
    let q = (await db()).from('space_calendar_day_notes').select(DAY_NOTE_COLS).eq('space_id', spaceId)
    if (opts.publicOnly) q = q.eq('visibility', 'public')
    const { data, error } = await q.order('sort', { ascending: true })
    if (error || !data) return []
    return data.map(dayNoteFromRow)
  } catch {
    return []
  }
}

export async function insertDayNote(spaceId: string, row: DayNoteWrite, createdBy: string, sort: number): Promise<Result> {
  const { data, error } = await (await db())
    .from('space_calendar_day_notes')
    .insert({ ...row, space_id: spaceId, created_by: createdBy, sort })
    .select('id')
  return error || !data?.length ? { error: 'The note could not be saved.' } : { data: true }
}

export async function updateDayNote(spaceId: string, id: string, row: DayNoteWrite): Promise<Result> {
  const { data, error } = await (await db())
    .from('space_calendar_day_notes')
    .update(row)
    .eq('space_id', spaceId)
    .eq('id', id)
    .select('id')
  return error || !data?.length ? { error: 'The note could not be saved.' } : { data: true }
}

export async function deleteDayNote(spaceId: string, id: string): Promise<Result> {
  const { data, error } = await (await db())
    .from('space_calendar_day_notes')
    .delete()
    .eq('space_id', spaceId)
    .eq('id', id)
    .select('id')
  return error || !data?.length ? { error: 'The note could not be deleted.' } : { data: true }
}
