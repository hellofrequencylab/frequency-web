'use server'

// THE ASSIGNABLE-RELATIONSHIP WRITE SURFACE (Resonance CRM · ADR-625). The read path is fully built —
// the classifier folds each contact's stored `contact_relationships` rows into `relationshipKinds`,
// which the Contacts tab paints as row chips and offers as the "Relationship" facet. These two actions
// are the WRITER that path was waiting on: an operator confers or ends an ASSIGNABLE standing
// (donor / partner / vendor / labs_member / volunteer) on any contact, and the revalidate re-runs the
// roster so the new kind flows straight into the chips + facet on the next render.
//
// GATING: the CRM suite is a STAFF tool. Every mutation runs the same write-level gate the Contacts
// page reads — requireAdmin('janitor', { staff: 'marketing' }) — BEFORE any write (a denied gate
// redirects, which surfaces as a throw inside an action, so nothing is persisted).
//
// VALIDATION: `kind` is validated against the registry via isAssignableKind — an unknown OR a DERIVED
// kind (member / subscriber / lead / business, which are computed and never stored) is refused with a
// friendly error and no write. The lib writers are themselves fail-safe (a miss returns false), so a
// failed write degrades to a friendly error, never a throw. Copy is plain, no em dashes.

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { addRelationship, endRelationship, isAssignableKind } from '@/lib/crm/relationships'
import { type ActionResult, ok, fail } from '@/lib/action-result'

/** The Contacts tab reads the roster; revalidating it re-classifies the cohort so a just-assigned kind
 *  reappears in the row chips + the "Relationship" facet. */
const CONTACTS_PATH = '/admin/crm/contacts'

/** Confer an assignable relationship kind on a contact. Staff-gated; validates the kind against the
 *  registry (assignable only); fail-safe (a bad write returns a friendly error, never a throw). */
export async function assignRelationship(contactId: string, kind: string): Promise<ActionResult> {
  await requireAdmin('janitor', { staff: 'marketing' })
  if (!contactId) return fail('Pick a contact first.')
  if (!isAssignableKind(kind)) return fail('That is not a relationship you can assign.')

  const saved = await addRelationship(contactId, kind)
  if (!saved) return fail('That relationship could not be saved. Try again.')

  revalidatePath(CONTACTS_PATH)
  return ok()
}

/** End an assignable relationship kind on a contact (soft close). Same gate + registry validation as
 *  assign; fail-safe. */
export async function removeRelationship(contactId: string, kind: string): Promise<ActionResult> {
  await requireAdmin('janitor', { staff: 'marketing' })
  if (!contactId) return fail('Pick a contact first.')
  if (!isAssignableKind(kind)) return fail('That is not a relationship you can remove.')

  const ended = await endRelationship({ contactId, kind })
  if (!ended) return fail('That relationship could not be removed. Try again.')

  revalidatePath(CONTACTS_PATH)
  return ok()
}
