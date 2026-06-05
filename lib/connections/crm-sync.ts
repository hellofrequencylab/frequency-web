// Bridge a scanned personal contact into the SHARED Studio CRM (`contacts`) as an
// UNKNOWN / unsubscribed lead — never auto-subscribed (ADR-099). Idempotent on
// lower(email); links the personal `network_contacts` row back via
// linked_contact_id. Server-only (contacts is service-role).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

/** Upsert the scanned contact into `contacts` and link it to the personal card.
 *  Returns the contacts.id (or null). Existing rows keep their own source/consent —
 *  we never downgrade a real member/subscriber to a scan lead. */
export async function syncScanToCrm(input: {
  ownerId: string
  networkContactId: string
  email: string
  displayName?: string | null
}): Promise<string | null> {
  const email = input.email.trim().toLowerCase()
  if (!email) return null

  const db = createAdminClient() as unknown as SupabaseClient
  const now = new Date().toISOString()

  const { data: existing } = await db
    .from('contacts')
    .select('id, display_name')
    .ilike('email', email)
    .maybeSingle()

  let contactId = (existing as { id?: string } | null)?.id ?? null

  if (contactId) {
    // Touch only — don't clobber an existing lead/member's source or consent_state.
    await db
      .from('contacts')
      .update({
        display_name: (existing as { display_name?: string | null }).display_name ?? input.displayName ?? null,
        last_seen_at: now,
        updated_at: now,
      })
      .eq('id', contactId)
  } else {
    const { data: inserted } = await db
      .from('contacts')
      .insert({
        email,
        display_name: input.displayName ?? null,
        consent_state: 'unknown', // a lead — NOT subscribed, not marketable
        source: 'scan_invite',
      })
      .select('id')
      .maybeSingle()
    contactId = (inserted as { id?: string } | null)?.id ?? null
  }

  if (contactId) {
    await db
      .from('network_contacts')
      .update({ linked_contact_id: contactId })
      .eq('id', input.networkContactId)
      .eq('owner_id', input.ownerId)
  }
  return contactId
}
