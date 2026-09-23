import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/database.types'
import { MAX_LOG_RECORDS, parseVeraLogSteps, type VeraLogRecord, type VeraLogStep } from './vera-command'
import { log } from '@/lib/log'

// THE VERA CHANGE LOG, IO (PROG-CAL11 slice 3). Caller session, so RLS on space_vera_changes is the
// lock, the same as every other Plan-side table. No admin client on a new path (AGENTS.md).
//
// The table is APPEND ONLY and the database is what holds that: the migration gives it a select
// policy and an insert policy and no update or delete policy at all. There is no update function in
// this file because there is nothing to update, and an Undo writes a NEW row pointing back.
//
// EVERY FAILURE IS LOGGED, for the reason plans-store.ts spells out at length: a read path that
// swallows its error turns an outage into an empty state, and the 2026-09-21 RLS recursion outage
// went five days unnoticed exactly that way. The record failing to write must NOT fail the changes
// that already landed, so `recordVeraChanges` returns its error to the caller, which reports it on
// its own line rather than pretending the batch did not happen.

const COLS = 'id, space_id, applied_by, steps, undo_of, created_at'

type LogRow = {
  id: string
  space_id: string
  applied_by: string | null
  steps: Json
  undo_of: string | null
  created_at: string
}

async function db() {
  return await createClient()
}

function logIoFailed(op: string, error: unknown): void {
  const e = (error ?? null) as { message?: string; code?: string; details?: string; hint?: string } | null
  log.error(`calendar.vera_log.${op}_failed`, {
    db_error: e?.message ?? String(error ?? 'unknown'),
    db_code: e?.code ?? null,
    db_details: e?.details ?? null,
    db_hint: e?.hint ?? null,
  })
}

/**
 * Write one record: the steps that landed, in the order they ran, and the record this one reversed
 * when it is an Undo. Returns the new record's id so the caller can say which one it wrote.
 */
export async function recordVeraChanges(
  spaceId: string,
  profileId: string | null,
  steps: readonly VeraLogStep[],
  undoOf: string | null,
): Promise<{ data: { id: string } } | { error: string }> {
  try {
    const { data, error } = await (await db())
      .from('space_vera_changes')
      .insert({
        space_id: spaceId,
        applied_by: profileId,
        steps: steps as unknown as Json,
        undo_of: undoOf,
      })
      .select('id')
      .single()
    if (error || !data) {
      logIoFailed('insert', error)
      return { error: 'The changes landed, but they were not written to the change log, so Undo will not offer them.' }
    }
    return { data: { id: data.id } }
  } catch (error) {
    logIoFailed('insert', error)
    return { error: 'The changes landed, but they were not written to the change log, so Undo will not offer them.' }
  }
}

/** One record, or null. Used by the Undo door, which needs the steps of exactly one batch. */
export async function getVeraChangeRecord(spaceId: string, id: string): Promise<VeraLogRecord | null> {
  try {
    const { data, error } = await (await db())
      .from('space_vera_changes')
      .select(COLS)
      .eq('space_id', spaceId)
      .eq('id', id)
      .maybeSingle()
    if (error) {
      logIoFailed('get', error)
      return null
    }
    return data ? mapRecord(data as LogRow, null) : null
  } catch (error) {
    logIoFailed('get', error)
    return null
  }
}

/**
 * The Space's recent records, newest first. `undoneBy` is filled in from the same page: a record
 * that a later record reversed says so, which is what stops a person undoing the same batch twice
 * and being surprised that the second one changed nothing.
 */
export async function listVeraChangeRecords(spaceId: string): Promise<VeraLogRecord[]> {
  try {
    const { data, error } = await (await db())
      .from('space_vera_changes')
      .select(COLS)
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false })
      .limit(MAX_LOG_RECORDS)
    if (error || !data) {
      logIoFailed('list', error)
      return []
    }
    const rows = data as LogRow[]
    const undoneBy = new Map<string, string>()
    for (const row of rows) if (row.undo_of) undoneBy.set(row.undo_of, row.id)
    return rows.map((row) => mapRecord(row, undoneBy.get(row.id) ?? null))
  } catch (error) {
    logIoFailed('list', error)
    return []
  }
}

function mapRecord(row: LogRow, undoneBy: string | null): VeraLogRecord {
  return {
    id: row.id,
    at: row.created_at,
    steps: parseVeraLogSteps(row.steps),
    undoOf: row.undo_of,
    undoneBy,
  }
}
