'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireStaffCap } from '@/lib/staff'
import { setPlatformFlag } from '@/lib/platform-flags'

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

// Operator switch: send the one-time intro email when a steward scans someone into
// their personal CRM. Default off; every flip is audited in platform_flag_events.
export async function setScanInviteEnabled(enabled: boolean): Promise<void> {
  const me = await requireStaffCap('marketing')
  await setPlatformFlag('scan_invite_email_enabled', enabled, { changedBy: me.profileId, source: 'admin' })
  revalidatePath('/admin/marketing/contacts')
}
