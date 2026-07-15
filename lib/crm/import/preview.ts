// The dry-run preview (CRM Master Build Plan Phase 2): read the target's existing
// contact keys, run the PURE planCommit, and return the { created, merged, skipped,
// flagged } diff + the row-level errors shown before commit. Server-only (reads the
// scoped target). Mirrors the dedupe keys the commit path uses so the preview counts
// match the commit exactly.

import { createAdminClient } from '@/lib/supabase/admin'
import { existingContactKeys } from '@/lib/connections/store'
import { planCommit, emailKey, phoneKey, toValidationResult, type ExistingKeys } from './dedupe'
import { getRootSpaceId } from './store'
import type { ContactImportRow, ValidationResult } from './types'

/** Read the existing keys for a `contacts(space_id)` scope (a tenant Space, or the ROOT
 *  platform hub). For the platform hub we also key on the last-10 phone stashed in
 *  meta.phone so the preview's dedupe matches the commit's email-AND-phone dedupe. */
async function readContactsKeys(spaceId: string, dedupePhone: boolean): Promise<ExistingKeys> {
  const emails = new Set<string>()
  const phones = new Set<string>()
  try {
    const { data } = await createAdminClient()
      .from('contacts')
      .select('email, meta')
      .eq('space_id', spaceId)
    for (const r of (data ?? []) as { email: string | null; meta: Record<string, unknown> | null }[]) {
      const ek = emailKey(r.email)
      if (ek) emails.add(ek)
      if (dedupePhone) {
        const raw = r.meta && typeof r.meta.phone === 'string' ? r.meta.phone : null
        const pk = phoneKey(raw)
        if (pk) phones.add(pk)
      }
    }
  } catch {
    /* read failure -> empty index (preview shows all as new; commit is the same) */
  }
  return { emails, phones: dedupePhone ? phones : new Set() }
}

/** Read the existing contact keys for a staged import's target (member book, Space list,
 *  or the platform ROOT hub). */
async function readExistingKeys(row: ContactImportRow): Promise<ExistingKeys> {
  if (row.targetKind === 'platform') {
    const rootId = await getRootSpaceId()
    if (!rootId) return { emails: new Set(), phones: new Set() }
    return readContactsKeys(rootId, true)
  }
  if (row.targetKind === 'space' && row.targetSpaceId) {
    return readContactsKeys(row.targetSpaceId, false)
  }
  // member target
  try {
    return await existingContactKeys(row.createdBy)
  } catch {
    return { emails: new Set(), phones: new Set() }
  }
}

/** Compute the dry-run validation for the CURRENT mapping + merge strategy on a row. */
export async function computeValidation(row: ContactImportRow): Promise<ValidationResult> {
  const existing = await readExistingKeys(row)
  const plan = planCommit(row.source.rows, row.mapping, existing, row.mergeStrategy)
  return toValidationResult(plan)
}
