'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireStaff } from '@/lib/staff'

// Change a contact's marketing consent (subscribe / unsubscribe). Marketing
// sends are consent-gated, so unsubscribing stops campaigns to that address.
export async function setContactConsent(
  id: string,
  state: 'subscribed' | 'unsubscribed',
): Promise<void> {
  await requireStaff('marketer')
  const db = createAdminClient() as unknown as SupabaseClient
  await db
    .from('contacts')
    .update({ consent_state: state, updated_at: new Date().toISOString() })
    .eq('id', id)
  revalidatePath('/marketing/contacts')
}
