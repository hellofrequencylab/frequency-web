// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the business_intake PERSISTENCE layer (P1,
// docs/BUSINESS-IMPORTER.md §3). SERVER-ONLY, service-role admin client. The table is
// service-role-only (RLS enabled, no policies — migration 20261022000000), so the ONLY
// access path is this gated module. Not in database.types yet (ADR-246), so reached via a
// narrow untyped cast, exactly like the space_* tables in materialize.ts.
//
// TENANCY: every mutation binds to the intake `id` (the row's own scope), and every read/
// create binds to `created_by` (the operator/owner). Status writes go through canTransition
// so a stale background job can never march a row backward (e.g. un-apply a live Space).
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/admin'
import type { BusinessProfile, ProvenanceLedger } from './schema'
import {
  canTransition,
  type BusinessIntakeRow,
  type HarvestedSource,
  type IntakeInputs,
  type IntakeMode,
  type IntakeStatus,
} from './intake'

const TABLE = 'business_intake'

/** The untyped admin handle for business_intake (table not in database.types yet, ADR-246). */
function intakeTable() {
  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }> }
      }
      update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> }
      select: (cols: string) => {
        eq: (c: string, v: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>
          order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }> }
        }
      }
    }
  }
  return db.from(TABLE)
}

/** Map a raw DB row to the typed BusinessIntakeRow. Defensive: jsonb columns default to their
 *  empty shape so a partial row never crashes a consumer. */
function mapRow(raw: Record<string, unknown>): BusinessIntakeRow {
  return {
    id: raw.id as string,
    createdBy: raw.created_by as string,
    mode: (raw.mode as IntakeMode) ?? 'operator',
    status: (raw.status as IntakeStatus) ?? 'intake',
    inputs: (raw.inputs as IntakeInputs) ?? {},
    rawSources: (raw.raw_sources as HarvestedSource[]) ?? [],
    draft: (raw.draft as Record<string, unknown>) ?? {},
    ledger: (raw.ledger as Record<string, unknown>) ?? {},
    budgetSpent: Number(raw.budget_spent ?? 0),
    targetSpaceId: (raw.target_space_id as string | null) ?? null,
    appliedAt: (raw.applied_at as string | null) ?? null,
    error: (raw.error as string | null) ?? null,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  }
}

/** Create a new intake row from captured inputs, status 'intake'. Bound to `createdBy` (the
 *  operator/owner). Returns the new row id, or null on failure. */
export async function createIntake(input: {
  createdBy: string
  mode: IntakeMode
  inputs: IntakeInputs
}): Promise<string | null> {
  try {
    const { data, error } = await intakeTable()
      .insert({
        created_by: input.createdBy,
        mode: input.mode,
        status: 'intake',
        inputs: input.inputs,
      })
      .select('id')
      .maybeSingle()
    if (error || !data?.id) return null
    return data.id as string
  } catch {
    return null
  }
}

/** Create a master-profile intake ADOPTED from an existing (hand-made) Space: it lands already at
 *  status 'applied' with `target_space_id` set, because the Space it describes is already live. Bound to
 *  `createdBy`. Returns the new row id, or null on failure. This is how a business that was never seeded
 *  gets an editable master profile derived from its own content (Importer v2). */
export async function createMasterProfile(input: {
  createdBy: string
  spaceId: string
  inputs: IntakeInputs
  draft: BusinessProfile
  ledger: ProvenanceLedger
}): Promise<string | null> {
  try {
    const now = new Date().toISOString()
    const { data, error } = await intakeTable()
      .insert({
        created_by: input.createdBy,
        mode: 'operator',
        status: 'applied',
        inputs: input.inputs,
        draft: input.draft,
        ledger: input.ledger,
        target_space_id: input.spaceId,
        applied_at: now,
      })
      .select('id')
      .maybeSingle()
    if (error || !data?.id) return null
    return data.id as string
  } catch {
    return null
  }
}

/** Read one intake row by id. Bound to the row's own id (the scope). Returns null when absent. */
export async function getIntake(id: string): Promise<BusinessIntakeRow | null> {
  try {
    const { data, error } = await intakeTable().select('*').eq('id', id).maybeSingle()
    if (error || !data) return null
    return mapRow(data)
  } catch {
    return null
  }
}

/** Read the intake that seeded a given Space (its master profile), by the `target_space_id` stamped at
 *  Apply. Most-recent first when several point at the same Space. Bound to the space id. Returns null
 *  when the Space was never seeded (no intake links to it). This is the ONE-WAY link's reverse: a Space
 *  back to the master profile that can re-seed it. */
export async function getIntakeBySpaceId(spaceId: string): Promise<BusinessIntakeRow | null> {
  try {
    const { data, error } = await intakeTable()
      .select('*')
      .eq('target_space_id', spaceId)
      .order('updated_at', { ascending: false })
      .limit(1)
    if (error || !data || data.length === 0) return null
    return mapRow(data[0])
  } catch {
    return null
  }
}

/** Batched reverse lookup: map each of `spaceIds` to the id of the intake that seeded it (its master
 *  profile), for a list view that wants a "re-seed" affordance per row WITHOUT an N+1. A Space with no
 *  seeding intake is simply absent from the map. Most-recent intake wins when several point at a Space. */
export async function intakeIdsBySpaceIds(spaceIds: string[]): Promise<Record<string, string>> {
  const ids = spaceIds.filter((s) => typeof s === 'string' && s.length > 0)
  if (ids.length === 0) return {}
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          in: (c: string, v: string[]) => {
            order: (c: string, o: { ascending: boolean }) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>
          }
        }
      }
    }
    const { data, error } = await db
      .from(TABLE)
      .select('id, target_space_id, updated_at')
      .in('target_space_id', ids)
      .order('updated_at', { ascending: false })
    if (error || !data) return {}
    const out: Record<string, string> = {}
    // Most-recent first (order desc), so the FIRST id seen per space wins; skip if already set.
    for (const raw of data) {
      const spaceId = raw.target_space_id as string | null
      const intakeId = raw.id as string | undefined
      if (spaceId && intakeId && !out[spaceId]) out[spaceId] = intakeId
    }
    return out
  } catch {
    return {}
  }
}

/** The harvest result to persist (the raw sources cache + any captured media urls, folded into
 *  the draft's media by the pipeline). */
export interface StoredHarvest {
  rawSources: HarvestedSource[]
}

/** Persist a status transition (guarded by canTransition) + an optional error. Bound to `id`.
 *  A disallowed transition is a NO-OP that returns false (a stale job can't rewind the row). */
export async function setStatus(
  id: string,
  next: IntakeStatus,
  opts?: { error?: string | null },
): Promise<boolean> {
  const row = await getIntake(id)
  if (!row) return false
  if (!canTransition(row.status, next)) return false
  try {
    const patch: Record<string, unknown> = { status: next, updated_at: new Date().toISOString() }
    if (opts && 'error' in opts) patch.error = opts.error ?? null
    const { error } = await intakeTable().update(patch).eq('id', id)
    return !error
  } catch {
    return false
  }
}

/** Persist the harvested raw sources (the harvest cache). Bound to `id`. */
export async function saveRawSources(id: string, rawSources: HarvestedSource[]): Promise<boolean> {
  return update(id, { raw_sources: rawSources })
}

/** Persist the extracted/verified draft + ledger + the running budget spend. Bound to `id`. */
export async function saveDraft(
  id: string,
  input: { draft: BusinessProfile; ledger: ProvenanceLedger; budgetSpent?: number },
): Promise<boolean> {
  const patch: Record<string, unknown> = { draft: input.draft, ledger: input.ledger }
  if (typeof input.budgetSpent === 'number') patch.budget_spent = input.budgetSpent
  return update(id, patch)
}

/** Stamp the applied outcome (target_space_id + applied_at). Bound to `id`. Called by the Apply
 *  seam after the materializer runs; status is moved to 'applied' separately via setStatus. */
export async function markApplied(id: string, targetSpaceId: string): Promise<boolean> {
  return update(id, { target_space_id: targetSpaceId, applied_at: new Date().toISOString() })
}

/** Persist the intake INPUTS jsonb (the operator/owner front-door fields). Bound to `id`. Used by the
 *  Re-Seed action to update the seed mood (and, later, uploaded image inputs) before re-running. */
export async function setInputs(id: string, inputs: IntakeInputs): Promise<boolean> {
  return update(id, { inputs })
}

/** A generic bound update (always keyed by the row id + updated_at). */
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
