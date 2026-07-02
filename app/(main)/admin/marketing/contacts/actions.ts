'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/database.types'
import { requireStaffCap } from '@/lib/staff'
import { setPlatformFlag } from '@/lib/platform-flags'
import { recordContactInteraction } from '@/lib/crm/interactions'
import {
  buildContactPatch,
  isEmptyContactPatch,
  type ContactFieldInput,
} from '@/lib/crm/contact-fields'

// Change a contact's marketing consent (subscribe / unsubscribe). Marketing
// sends are consent-gated, so unsubscribing stops campaigns to that address.
export async function setContactConsent(
  id: string,
  state: 'subscribed' | 'unsubscribed',
): Promise<void> {
  await requireStaffCap('marketing')
  const db = createAdminClient()
  await db
    .from('contacts')
    .update({ consent_state: state, updated_at: new Date().toISOString() })
    .eq('id', id)
  revalidatePath('/admin/marketing/contacts')
}

// Bulk consent — the same logic as setContactConsent over a selection of ids (a staff
// "power action" on the roster, ADR-379). One scoped write bound to the selected ids
// (.in('id', …)), so check:authz sees the scope. No-ops on an empty selection.
export async function bulkSetContactConsent(
  ids: string[],
  state: 'subscribed' | 'unsubscribed',
): Promise<{ updated: number }> {
  await requireStaffCap('marketing')
  const unique = [...new Set(ids.filter((v) => typeof v === 'string' && v.length > 0))]
  if (unique.length === 0) return { updated: 0 }
  const db = createAdminClient()
  const { error } = await db
    .from('contacts')
    .update({ consent_state: state, updated_at: new Date().toISOString() })
    .in('id', unique)
  // Report 0 updated on a failed write so the client stops showing false success.
  if (error) return { updated: 0 }
  revalidatePath('/admin/marketing/contacts')
  return { updated: unique.length }
}

// Edit SAFE fields on a contact (ADR-379): display_name, city (stored at meta.city),
// and the source label. Email is the identity stitch key (ADR-130) and is NOT editable.
// `patch` is allowlisted by buildContactPatch, so arbitrary keys can never reach the DB.
// The write is scoped to the single contact id (.eq('id', …)).
export async function updateContactFields(
  id: string,
  patch: ContactFieldInput,
): Promise<{ ok: boolean }> {
  await requireStaffCap('marketing')
  if (!id) return { ok: false }

  const built = buildContactPatch(patch)
  if (isEmptyContactPatch(built)) return { ok: true }

  const db = createAdminClient()

  // City lives in the `meta` jsonb (the contacts row has no city column), so merge it
  // into the existing meta rather than clobbering acquisition + the rest.
  let metaUpdate: Record<string, unknown> | undefined
  if (built.cityProvided) {
    const { data: row } = await db.from('contacts').select('meta').eq('id', id).maybeSingle()
    const currentMeta = (row?.meta as Record<string, unknown> | null) ?? {}
    metaUpdate = { ...currentMeta }
    if (built.city === null) delete metaUpdate.city
    else metaUpdate.city = built.city
  }

  const { error } = await db
    .from('contacts')
    .update({
      ...built.columns,
      ...(metaUpdate ? { meta: metaUpdate as unknown as Json } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  // Report failure so the client stops showing a false "saved".
  if (error) return { ok: false }

  revalidatePath(`/admin/marketing/contacts/${id}`)
  revalidatePath('/admin/marketing/contacts')
  return { ok: true }
}

// Add a staff note to a contact's timeline. Records a 'note' interaction on the contact subject
// (owner = the acting staff member), so it shows in the person's chronological timeline. Staff-gated.
export async function addContactNote(id: string, body: string): Promise<{ ok: boolean }> {
  const me = await requireStaffCap('marketing')
  const text = body.trim().slice(0, 5000)
  if (!text) return { ok: false }
  const res = await recordContactInteraction({
    ownerProfileId: me.profileId,
    subjectKind: 'contact',
    subjectId: id,
    channel: 'note',
    direction: 'internal',
    summary: 'Staff note',
    body: text,
    source: 'manual',
  })
  revalidatePath(`/admin/marketing/contacts/${id}`)
  return { ok: !!res }
}

// Operator switch: send the one-time intro email when a steward scans someone into
// their personal CRM. Default off; every flip is audited in platform_flag_events.
export async function setScanInviteEnabled(enabled: boolean): Promise<void> {
  const me = await requireStaffCap('marketing')
  await setPlatformFlag('scan_invite_email_enabled', enabled, { changedBy: me.profileId, source: 'admin' })
  revalidatePath('/admin/marketing/contacts')
}
