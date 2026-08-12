// ─────────────────────────────────────────────────────────────────────────────
// THE EVENT SEEDER — the `event_intake` PERSISTENCE layer (ADR-989).
//
// SERVER-ONLY, service-role admin client. The table is service-role-only (RLS enabled, no
// policies, migration 20270222000000), so the ONLY access path is this gated module. It is
// not in database.types (ADR-246), so it is reached through a narrow untyped cast, exactly
// like lib/importer/store.ts reaches business_intake.
//
// TENANCY: every mutation binds to the intake `id` (the row's own scope); the list read binds
// to `created_by` (the operator). Status writes go through canTransition, so a stale caller
// can never march a row backward (e.g. un-apply an event that is already written).
//
// authz-delegated: the caller (app/(main)/admin/event-seeder/actions.ts and the WhatsApp
// stager) gates the operator; every write here is bound to the intake id it is handed.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ProvenanceLedger } from '@/lib/studio/kernel/ledger'
import {
  canTransition,
  type EventHarvestedSource,
  type EventIntakeInputs,
  type EventIntakeRow,
  type EventSeedDraft,
  type IntakeMode,
  type IntakeStatus,
} from './intake'

const TABLE = 'event_intake'

/** A filtered select over the untyped table. `eq` returns the same shape, so filters CHAIN:
 *  a caller-bound read narrows on the row id AND `created_by` in one query. */
interface IntakeSelect {
  eq: (c: string, v: string) => IntakeSelect
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>
  order: (c: string, o: { ascending: boolean }) => {
    limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>
  }
}

/** The untyped admin handle for event_intake (not in database.types yet, ADR-246). */
function intakeTable() {
  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }> }
      }
      update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> }
      select: (cols: string) => IntakeSelect
    }
  }
  return db.from(TABLE)
}

/** Map a raw DB row to the typed EventIntakeRow. Defensive: every jsonb column falls back to
 *  its empty shape, so a partial row never crashes a consumer. */
function mapRow(raw: Record<string, unknown>): EventIntakeRow {
  return {
    id: raw.id as string,
    createdBy: raw.created_by as string,
    mode: (raw.mode as IntakeMode) ?? 'operator',
    status: (raw.status as IntakeStatus) ?? 'intake',
    inputs: (raw.inputs as EventIntakeInputs) ?? { source: 'paste', consent: { isDemo: true } },
    rawSources: (raw.raw_sources as EventHarvestedSource[]) ?? [],
    draft: (raw.draft as Record<string, unknown>) ?? {},
    ledger: (raw.ledger as Record<string, unknown>) ?? {},
    budgetSpent: Number(raw.budget_spent ?? 0),
    targetEventId: (raw.target_event_id as string | null) ?? null,
    appliedAt: (raw.applied_at as string | null) ?? null,
    error: (raw.error as string | null) ?? null,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  }
}

/**
 * Stage one event for review. A seeded event lands at status 'review' by default, because
 * the read (the chat classifier, the poster scan) has ALREADY run before it gets here: there
 * is no research stage to wait on, so parking it at 'intake' would just be a lie on the board.
 * Bound to `createdBy`. Returns the new intake id, or null on failure.
 */
export async function createEventIntake(input: {
  createdBy: string
  inputs: EventIntakeInputs
  draft: EventSeedDraft
  ledger: ProvenanceLedger
  rawSources?: EventHarvestedSource[]
  status?: IntakeStatus
}): Promise<string | null> {
  try {
    const { data, error } = await intakeTable()
      .insert({
        created_by: input.createdBy,
        mode: 'operator',
        status: input.status ?? 'review',
        inputs: input.inputs,
        raw_sources: input.rawSources ?? [],
        draft: input.draft,
        ledger: input.ledger,
      })
      .select('id')
      .maybeSingle()
    if (error || !data?.id) return null
    return data.id as string
  } catch {
    return null
  }
}

/** Read one intake by id. Bound to the row's own id (the scope). Null when absent. */
/**
 * Read one intake **bound to the operator who created it**. The list view is already scoped to
 * `created_by`, so an id-only read let a per-row action reach a row the list would never show:
 * any authorized operator holding another operator's row id could open and seed it. The gate says
 * "you may use this console", not "you may act on that row", and those are different questions.
 *
 * Returns null on a miss, which every caller already renders as an honest empty state.
 */
export async function getEventIntakeForOperator(id: string, operatorId: string): Promise<EventIntakeRow | null> {
  try {
    const { data, error } = await intakeTable().select('*').eq('id', id).eq('created_by', operatorId).maybeSingle()
    if (error || !data) return null
    return mapRow(data)
  } catch {
    return null
  }
}

export async function getEventIntake(id: string): Promise<EventIntakeRow | null> {
  try {
    const { data, error } = await intakeTable().select('*').eq('id', id).maybeSingle()
    if (error || !data) return null
    return mapRow(data)
  } catch {
    return null
  }
}

/** List one operator's staged events, most-recently-touched first. Bound to `created_by`, so
 *  an operator sees only their own. Fail-safe: [] on any error. */
export async function listEventIntakes(operatorId: string, limit = 100): Promise<EventIntakeRow[]> {
  try {
    const { data, error } = await intakeTable()
      .select('*')
      .eq('created_by', operatorId)
      .order('updated_at', { ascending: false })
      .limit(limit)
    if (error || !data) return []
    return data.map(mapRow)
  } catch {
    return []
  }
}

/** Persist a status transition (guarded by canTransition) plus an optional error. Bound to
 *  `id`. A disallowed transition is a NO-OP that returns false. */
export async function setEventIntakeStatus(
  id: string,
  next: IntakeStatus,
  opts?: { error?: string | null },
): Promise<boolean> {
  const row = await getEventIntake(id)
  if (!row) return false
  if (!canTransition(row.status, next)) return false
  const patch: Record<string, unknown> = { status: next }
  if (opts && 'error' in opts) patch.error = opts.error ?? null
  return update(id, patch)
}

/** Persist the edited draft + ledger. Bound to `id`. */
export async function saveEventDraft(
  id: string,
  input: { draft: Record<string, unknown>; ledger: ProvenanceLedger },
): Promise<boolean> {
  return update(id, { draft: input.draft, ledger: input.ledger })
}

/** Persist the intake INPUTS jsonb (consent, source notes). Bound to `id`. */
export async function setEventIntakeInputs(id: string, inputs: EventIntakeInputs): Promise<boolean> {
  return update(id, { inputs })
}

/** Stamp the applied outcome (target_event_id + applied_at). Bound to `id`. Called by the
 *  apply after the event writer runs; the status moves to 'applied' separately. */
export async function markEventIntakeApplied(id: string, targetEventId: string): Promise<boolean> {
  return update(id, { target_event_id: targetEventId, applied_at: new Date().toISOString() })
}

/** A generic bound update (always keyed by the row id, always stamping updated_at). */
async function update(id: string, patch: Record<string, unknown>): Promise<boolean> {
  try {
    const { error } = await intakeTable()
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    return !error
  } catch {
    return false
  }
}
