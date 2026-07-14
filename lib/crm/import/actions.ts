'use server'

// Server actions for the CSV import wizard (CRM Master Build Plan Phase 2). Each stage
// of parse -> map -> validate -> preview -> commit crosses the boundary here. Auth +
// tenancy live in these actions; the pure work is delegated to map.ts / dedupe.ts /
// preview.ts / commit.ts. The client parses the CSV (Papa Parse) and hands the parsed
// rows to stageImport; from there the file lives in the staging row (server-side) and
// only a SMALL sample ever reaches the model.

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { aiAvailable, featureOverBudget } from '@/lib/ai/usage'
import { listManagedSpaces, type ManagedSpace } from '@/lib/spaces/managed'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { autoMapColumns, headerFingerprint } from './map'
import { proposeMapping, type AiSuggestion } from './ai'
import { computeValidation } from './preview'
import { commitImport } from './commit'
import { createImport, getImport, updateImport, findRememberedMapping, listCustomFields } from './store'
import type {
  ParsedSource,
  ColumnMapping,
  ImportTargetKind,
  MergeStrategy,
  ValidationResult,
  CommitResult,
} from './types'

/** The Spaces the caller may import into (owned / editor+), for the target picker. */
export async function listImportSpaces(): Promise<ManagedSpace[]> {
  return listManagedSpaces()
}

async function requireProfile(): Promise<string> {
  const id = await getMyProfileId()
  if (!id) throw new Error('Sign in to import contacts.')
  return id
}

async function assertCanTargetSpace(spaceId: string): Promise<boolean> {
  const spaces = await listManagedSpaces()
  return spaces.some((s) => s.id === spaceId)
}

export interface StageImportInput {
  targetKind: ImportTargetKind
  spaceId?: string | null
  filename?: string | null
  source: ParsedSource
}

export interface StageImportData {
  id: string
  mapping: ColumnMapping[]
  /** Whether a remembered mapping (same file shape) was applied. */
  remembered: boolean
}

/** Stage a parsed CSV: gate the target, auto-map every column (applying a remembered
 *  mapping for the same file shape when we have one), and create the staging row. */
export async function stageImport(input: StageImportInput): Promise<ActionResult<StageImportData>> {
  let profileId: string
  try {
    profileId = await requireProfile()
  } catch {
    return fail('Sign in to import contacts.')
  }

  const source = input.source
  if (!source?.headers?.length) return fail('That file has no columns we can read.')
  if (!source.rows?.length) return fail('That file has no rows to import.')

  const targetKind: ImportTargetKind = input.targetKind === 'space' ? 'space' : 'member'
  const spaceId = targetKind === 'space' ? (input.spaceId ?? '').trim() : ''
  if (targetKind === 'space') {
    if (!spaceId) return fail('Pick a Space to import into.')
    if (!(await assertCanTargetSpace(spaceId))) {
      return fail('You can only import into a Space you manage.')
    }
  }

  const sample = source.rows.slice(0, 8)
  let mapping = autoMapColumns(source.headers, sample)

  // Apply a remembered mapping (same header fingerprint) when the user has committed one
  // before: keep the target for any header we recognize, so repeat imports are one click.
  let remembered = false
  const prior = await findRememberedMapping(profileId, headerFingerprint(source.headers))
  if (prior) {
    const priorByHeader = new Map(prior.map((m) => [m.header, m]))
    mapping = mapping.map((m) => {
      const p = priorByHeader.get(m.header)
      return p ? { ...p, confidence: 1, reason: 'manual' as const } : m
    })
    remembered = true
  }

  const row = await createImport({
    createdBy: profileId,
    targetKind,
    targetSpaceId: targetKind === 'space' ? spaceId : null,
    filename: input.filename ?? null,
    source,
    mapping,
  })
  if (!row) return fail('We could not stage that import. Try again.')

  return ok({ id: row.id, mapping: row.mapping, remembered })
}

/** Save the operator's edited column mapping. */
export async function saveMapping(id: string, mapping: ColumnMapping[]): Promise<ActionResult> {
  let profileId: string
  try {
    profileId = await requireProfile()
  } catch {
    return fail('Sign in to continue.')
  }
  const okd = await updateImport(id, profileId, { mapping, status: 'mapping' })
  return okd ? ok() : fail('We could not save that mapping.')
}

/** Ask Vera to suggest a mapping for the file's columns. Human approves; this only
 *  RETURNS suggestions (never auto-applies). Gated on the kill switch + the budget cap.
 *  FAIL-SOFT: an unavailable model returns a calm reason, never an error. */
export async function suggestMapping(id: string): Promise<ActionResult<AiSuggestion[]>> {
  let profileId: string
  try {
    profileId = await requireProfile()
  } catch {
    return fail('Sign in to continue.')
  }
  const row = await getImport(id, profileId)
  if (!row) return fail('We could not find that import.')

  if (!(await aiAvailable()) || (await featureOverBudget('crm-import-mapping'))) {
    return fail('Vera is resting right now. Your own picks still work.')
  }
  const suggestions = await proposeMapping({
    headers: row.source.headers,
    sampleRows: row.source.rows.slice(0, 8),
    profileId,
    spaceId: row.targetKind === 'space' ? row.targetSpaceId : null,
  })
  return ok(suggestions)
}

/** Run the dry-run preview for the given mapping + merge strategy: save them, then read
 *  the target's existing contacts and return the { created, merged, skipped } diff. */
export async function previewImport(
  id: string,
  mapping: ColumnMapping[],
  mergeStrategy: MergeStrategy,
): Promise<ActionResult<ValidationResult>> {
  let profileId: string
  try {
    profileId = await requireProfile()
  } catch {
    return fail('Sign in to continue.')
  }
  const saved = await updateImport(id, profileId, { mapping, mergeStrategy, status: 'preview' })
  if (!saved) return fail('We could not save your choices.')
  const row = await getImport(id, profileId)
  if (!row) return fail('We could not find that import.')

  const validation = await computeValidation(row)
  await updateImport(id, profileId, { validation })
  return ok(validation)
}

/** Commit the staged import into its scoped target. Idempotent + fail-safe per row. */
export async function commitAction(id: string): Promise<ActionResult<CommitResult>> {
  let profileId: string
  try {
    profileId = await requireProfile()
  } catch {
    return fail('Sign in to continue.')
  }
  const res = await commitImport(id, profileId)
  revalidatePath('/network/contacts')
  revalidatePath('/admin/marketing/contacts')
  return res
}

/** The known custom fields for the caller's scope, for the mapping UI hints. */
export async function listKnownCustomFields(spaceId?: string | null): Promise<{ key: string; label: string }[]> {
  const profileId = await getMyProfileId()
  if (!profileId) return []
  const fields = await listCustomFields(profileId, spaceId ?? null)
  return fields.map((f) => ({ key: f.key, label: f.label }))
}
