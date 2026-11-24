import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { log } from '@/lib/log'
import { ENTRY_COLS, type EntryRow } from './entries'
import { isTimeVoteChoice, type TimeVoteChoice, type TimeVoteRow } from './time-votes'

// FIND A TIME, the IO half (LIVE-2531). The caller's own session for every read and every member
// write, so the RLS on public.space_calendar_time_votes (migration 20270346400000) is the lock: the
// Space's team reads the votes, a member writes only their own, and a stranger's read comes back
// empty. Email votes (EMAIL-092) are the one exception and live in their own module, behind a
// verified link. Every failure logs first, so an empty poll over a refused read is visible.

const VOTE_COLS = 'entry_id, voter_profile_id, voter_email, voter_name, choice'
const MAX_OPTIONS = 12

/** The table is not in lib/database.types.ts until the migration applies and types regenerate
 *  (ADR-246), so it is reached through this narrow untyped seam. */
type Result<T> = PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>
type Query<T> = Result<T> & {
  eq: (c: string, v: string) => Query<T>
  in: (c: string, v: readonly string[]) => Query<T>
  is: (c: string, v: null) => Query<T>
  order: (c: string, o: { ascending: boolean }) => Query<T>
  limit: (n: number) => Query<T>
}
type Untyped = {
  from: (t: string) => {
    select: <T>(cols: string) => Query<T>
    insert: (row: Record<string, unknown>) => Result<unknown>
    update: (row: Record<string, unknown>) => Query<unknown>
    delete: () => Query<unknown>
  }
}

async function db(): Promise<Untyped> {
  return (await createClient()) as unknown as Untyped
}

function voteIoFailed(op: string, error: unknown): void {
  const e = (error ?? null) as { message?: string; code?: string } | null
  log.error(`calendar.time_vote.${op}_failed`, { db_error: e?.message ?? String(error ?? 'unknown'), db_code: e?.code ?? null })
}

/** The Plan's candidate dates: its live Pencil rows that have not become an event, earliest first. */
export async function listPlanTimeOptionRows(spaceId: string, planId: string): Promise<EntryRow[]> {
  try {
    const { data, error } = await (await db())
      .from('space_calendar_entries')
      .select<EntryRow[]>(ENTRY_COLS)
      .eq('space_id', spaceId)
      .eq('plan_id', planId)
      .eq('kind', 'pencil')
      .is('removed_at', null)
      .is('published_event_id', null)
      .order('starts_at', { ascending: true })
      .limit(MAX_OPTIONS)
    if (error || !data) {
      voteIoFailed('options', error)
      return []
    }
    return data
  } catch (err) {
    voteIoFailed('options', err)
    return []
  }
}

/** Every vote on these candidate dates the session may read. */
export async function listTimeVoteRows(entryIds: readonly string[]): Promise<TimeVoteRow[]> {
  if (entryIds.length === 0) return []
  try {
    const { data, error } = await (await db())
      .from('space_calendar_time_votes')
      .select<TimeVoteRow[]>(VOTE_COLS)
      .in('entry_id', entryIds)
      .limit(1000)
    if (error || !data) {
      voteIoFailed('list', error)
      return []
    }
    return data.filter((v) => isTimeVoteChoice(v.choice))
  } catch (err) {
    voteIoFailed('list', err)
    return []
  }
}

/** Set, change or take back (choice null) the caller's own answer on one candidate date. */
export async function setMyTimeVoteRow(
  spaceId: string,
  entryId: string,
  profileId: string,
  choice: TimeVoteChoice | null,
): Promise<{ ok: true } | { error: string }> {
  try {
    const client = await db()
    if (choice === null) {
      const { error } = await client
        .from('space_calendar_time_votes')
        .delete()
        .eq('entry_id', entryId)
        .eq('voter_profile_id', profileId)
      if (error) {
        voteIoFailed('delete', error)
        return { error: 'Your answer could not be taken back.' }
      }
      return { ok: true }
    }
    const existing = await client
      .from('space_calendar_time_votes')
      .select<{ entry_id: string }[]>('entry_id')
      .eq('entry_id', entryId)
      .eq('voter_profile_id', profileId)
      .limit(1)
    if (existing.error) {
      voteIoFailed('read_own', existing.error)
      return { error: 'Your answer could not be saved.' }
    }
    const { error } = existing.data?.length
      ? await client
          .from('space_calendar_time_votes')
          .update({ choice })
          .eq('entry_id', entryId)
          .eq('voter_profile_id', profileId)
      : await client
          .from('space_calendar_time_votes')
          .insert({ space_id: spaceId, entry_id: entryId, voter_profile_id: profileId, choice })
    if (error) {
      voteIoFailed('write', error)
      return { error: 'Your answer could not be saved.' }
    }
    return { ok: true }
  } catch (err) {
    voteIoFailed('write', err)
    return { error: 'Your answer could not be saved.' }
  }
}
