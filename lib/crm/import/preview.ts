// The dry-run preview (CRM Master Build Plan Phase 2): read the target's existing
// contact keys, run the PURE planCommit, and return the { created, merged, skipped,
// flagged } diff + the row-level errors shown before commit. Server-only (reads the
// scoped target). Mirrors the dedupe keys the commit path uses so the preview counts
// match the commit exactly.

import { createAdminClient } from '@/lib/supabase/admin'
import { existingContactKeys } from '@/lib/connections/store'
import { planCommit, emailKey, toValidationResult, type ExistingKeys } from './dedupe'
import type { ContactImportRow, ValidationResult } from './types'

/** Read the existing contact keys for a staged import's target (member book or Space list). */
async function readExistingKeys(row: ContactImportRow): Promise<ExistingKeys> {
  if (row.targetKind === 'space' && row.targetSpaceId) {
    const emails = new Set<string>()
    try {
      const { data } = await createAdminClient()
        .from('contacts')
        .select('email')
        .eq('space_id', row.targetSpaceId)
      for (const r of (data ?? []) as { email: string | null }[]) {
        const ek = emailKey(r.email)
        if (ek) emails.add(ek)
      }
    } catch {
      /* read failure -> empty index (preview shows all as new; commit is the same) */
    }
    return { emails, phones: new Set() }
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
