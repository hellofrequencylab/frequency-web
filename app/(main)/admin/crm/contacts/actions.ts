'use server'

import { revalidatePath } from 'next/cache'
import { requireStaffCap } from '@/lib/staff'
import { setContactsConsent } from '@/lib/crm/contact-consent'
import { setPlatformFlag } from '@/lib/platform-flags'

// THE CONTACTS-ROSTER WRITE SURFACE (LIVE-239). These three actions arrived with the retirement of
// /admin/marketing/contacts, the second contacts roster: the per-row consent toggle, the bulk consent
// power action (ADR-379), and the scan-intro operator switch were the only things that page carried
// and this one did not, so they moved here rather than being dropped.
//
// They are THIN, GATED ADAPTERS. The service-role write lives in lib/crm/contact-consent.ts ("the one
// place that answers may we contact this person", ADR-372) and the flag write in lib/platform-flags.ts,
// so retiring the page did not move the RLS-bypassing client into a new page directory: the
// admin-client ratchet (ADR-923) only shrank.
//
// GATE: requireStaffCap('marketing') on every action, the same capability the retired page's actions
// held and the same one the roster page renders behind. The action is the authority; a render gate is UX.

/** Subscribe / unsubscribe ONE contact. Marketing sends are consent-gated, so unsubscribing here stops
 *  campaigns to that address. Reports whether the write landed, so the island never paints a false
 *  success on a failed write (the roster's optimistic chip rolls back on `updated: 0`). */
export async function setContactConsent(
  id: string,
  state: 'subscribed' | 'unsubscribed',
): Promise<{ updated: number }> {
  await requireStaffCap('marketing')
  const updated = await setContactsConsent([id], state)
  if (updated > 0) revalidatePath('/admin/crm/contacts')
  return { updated }
}

/** The same write over a selection (the staff power action, ADR-379). One scoped update bound to the
 *  selected ids, so the roster's consent facet and its stats reflect it on the next read. No-ops on an
 *  empty selection; reports 0 on a failed write. */
export async function bulkSetContactConsent(
  ids: string[],
  state: 'subscribed' | 'unsubscribed',
): Promise<{ updated: number }> {
  await requireStaffCap('marketing')
  const updated = await setContactsConsent(ids, state)
  if (updated > 0) revalidatePath('/admin/crm/contacts')
  return { updated }
}

/** Operator switch: send the one-time intro email when a steward scans someone into their personal CRM.
 *  Default off; every flip is audited in platform_flag_events. */
export async function setScanInviteEnabled(enabled: boolean): Promise<void> {
  const me = await requireStaffCap('marketing')
  await setPlatformFlag('scan_invite_email_enabled', enabled, { changedBy: me.profileId, source: 'admin' })
  revalidatePath('/admin/crm/contacts')
}
