// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE for CSV contact import (CRM Master Build Plan Phase 2). The
// `contact_import` staging row + the `custom_field_registry` are NOT in
// database.types yet (ADR-246), so we reach them through an UNTYPED admin handle
// (the reminders/client_notes convention). Server-only; every read/write is scoped
// to the creator (`created_by`), with RLS forced as the backstop.
//
// FAIL-SAFE: reads degrade to null / [] on error; writes return false — an import
// staging failure never throws into the wizard.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/admin'
import { headerFingerprint } from './map'
import type {
  ContactImportRow,
  ImportStatus,
  ImportTargetKind,
  ParsedSource,
  ColumnMapping,
  ValidationResult,
  MergeStrategy,
  CommitResult,
  CustomFieldEntry,
  ValueType,
} from './types'

/** The contact_import table via an untyped admin handle. */
function importsTable() {
  return (createAdminClient() as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => { select: (c: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }> } }
      select: (c: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> }
          order: (col: string, opts: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null }> }
        }
      }
      update: (patch: Record<string, unknown>) => { eq: (col: string, val: string) => { eq: (col: string, val: string) => Promise<{ error: unknown }> } }
    }
  }).from('contact_import')
}

/** The custom_field_registry table via an untyped admin handle. */
function registryTable() {
  return (createAdminClient() as unknown as {
    from: (t: string) => {
      select: (c: string) => { eq: (col: string, val: string) => { order: (col: string, opts: { ascending: boolean }) => Promise<{ data: Record<string, unknown>[] | null }> } }
      insert: (rows: Record<string, unknown>[]) => Promise<{ error: unknown }>
    }
  }).from('custom_field_registry')
}

function mapRow(r: Record<string, unknown>): ContactImportRow {
  return {
    id: String(r.id),
    createdBy: String(r.created_by),
    targetKind: (r.target_kind as ImportTargetKind) ?? 'member',
    targetSpaceId: (r.target_space_id as string) ?? null,
    status: (r.status as ImportStatus) ?? 'uploaded',
    filename: (r.filename as string) ?? null,
    source: (r.source as ParsedSource) ?? { headers: [], rows: [], rowCount: 0 },
    mapping: (r.mapping as ColumnMapping[]) ?? [],
    validation: (r.validation as ValidationResult) ?? {},
    mergeStrategy: (r.merge_strategy as MergeStrategy) ?? 'fill_empty',
    result: (r.result as CommitResult) ?? {},
    error: (r.error as string) ?? null,
    committedAt: (r.committed_at as string) ?? null,
    createdAt: (r.created_at as string) ?? '',
    updatedAt: (r.updated_at as string) ?? '',
  }
}

/** Cap on rows staged per import (guards the jsonb column + the commit loop). */
export const MAX_IMPORT_ROWS = 5000

export interface CreateImportInput {
  createdBy: string
  targetKind: ImportTargetKind
  targetSpaceId?: string | null
  filename?: string | null
  source: ParsedSource
  mapping: ColumnMapping[]
}

/** Stage a new import row (status='mapping', the parsed file + the auto-map already
 *  computed). Returns the row or null on failure. */
export async function createImport(input: CreateImportInput): Promise<ContactImportRow | null> {
  try {
    const cappedRows = input.source.rows.slice(0, MAX_IMPORT_ROWS)
    const source: ParsedSource = {
      headers: input.source.headers,
      rows: cappedRows,
      rowCount: input.source.rowCount,
    }
    const { data, error } = await importsTable()
      .insert({
        created_by: input.createdBy,
        target_kind: input.targetKind,
        target_space_id: input.targetSpaceId ?? null,
        status: 'mapping',
        filename: input.filename ?? null,
        source,
        mapping: input.mapping,
      })
      .select('*')
      .maybeSingle()
    if (error || !data) return null
    return mapRow(data)
  } catch {
    return null
  }
}

/** Read an import, scoped to its creator. Null when missing / not owned. */
export async function getImport(id: string, createdBy: string): Promise<ContactImportRow | null> {
  try {
    const { data } = await importsTable().select('*').eq('id', id).eq('created_by', createdBy).maybeSingle()
    return data ? mapRow(data) : null
  } catch {
    return null
  }
}

export interface UpdateImportPatch {
  status?: ImportStatus
  mapping?: ColumnMapping[]
  validation?: ValidationResult
  mergeStrategy?: MergeStrategy
  result?: CommitResult
  error?: string | null
  committedAt?: string | null
}

/** Patch an import, scoped to its creator. Returns false on error. */
export async function updateImport(id: string, createdBy: string, patch: UpdateImportPatch): Promise<boolean> {
  try {
    const u: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (patch.status !== undefined) u.status = patch.status
    if (patch.mapping !== undefined) u.mapping = patch.mapping
    if (patch.validation !== undefined) u.validation = patch.validation
    if (patch.mergeStrategy !== undefined) u.merge_strategy = patch.mergeStrategy
    if (patch.result !== undefined) u.result = patch.result
    if (patch.error !== undefined) u.error = patch.error
    if (patch.committedAt !== undefined) u.committed_at = patch.committedAt
    const { error } = await importsTable().update(u).eq('id', id).eq('created_by', createdBy)
    return !error
  } catch {
    return false
  }
}

// ── Custom-field registry ────────────────────────────────────────────────────────

/** The known custom fields for an owner + optional Space scope. Fail-safe to []. */
export async function listCustomFields(ownerId: string, spaceId: string | null): Promise<CustomFieldEntry[]> {
  try {
    const { data } = await registryTable().select('key, label, value_type, fingerprint, space_id').eq('owner_id', ownerId).order('created_at', { ascending: true })
    const wantSpace = spaceId ?? null
    return ((data ?? []) as Record<string, unknown>[])
      .filter((r) => ((r.space_id as string) ?? null) === wantSpace)
      .map((r) => ({
        key: String(r.key),
        label: (r.label as string) ?? String(r.key),
        valueType: (r.value_type as ValueType) ?? 'text',
        fingerprint: (r.fingerprint as string) ?? null,
      }))
  } catch {
    return []
  }
}

/** Register (idempotently) the custom fields a mapping introduced, keyed by the file's
 *  header fingerprint so a later import of the same shape can recall them. Read-then-insert
 *  the NEW keys only (the unique index still guards a race). Best-effort. */
export async function rememberCustomFields(input: {
  ownerId: string
  spaceId: string | null
  fields: { key: string; label: string; valueType: ValueType }[]
  fingerprint: string
}): Promise<void> {
  if (!input.fields.length) return
  try {
    const existing = await listCustomFields(input.ownerId, input.spaceId)
    const have = new Set(existing.map((f) => f.key))
    const rows = input.fields
      .filter((f) => f.key && !have.has(f.key))
      .map((f) => ({
        owner_id: input.ownerId,
        space_id: input.spaceId ?? null,
        key: f.key,
        label: f.label,
        value_type: f.valueType,
        fingerprint: input.fingerprint,
      }))
    if (rows.length) await registryTable().insert(rows)
  } catch {
    /* the registry is a convenience layer; a write failure never breaks a commit */
  }
}

/**
 * Find a remembered column mapping for a file with the given header fingerprint, from the
 * creator's most recent COMMITTED import of the same shape. Lets the wizard pre-fill the
 * exact mapping a user chose last time. Fail-safe to null.
 */
export async function findRememberedMapping(createdBy: string, fingerprint: string): Promise<ColumnMapping[] | null> {
  try {
    const { data } = await importsTable()
      .select('source, mapping, status')
      .eq('created_by', createdBy)
      .order('created_at', { ascending: false })
      .limit(50)
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      if ((r.status as string) !== 'committed') continue
      const source = (r.source as ParsedSource) ?? { headers: [] }
      if (headerFingerprint(source.headers ?? []) === fingerprint) {
        const mapping = (r.mapping as ColumnMapping[]) ?? []
        if (mapping.length) return mapping
      }
    }
    return null
  } catch {
    return null
  }
}
