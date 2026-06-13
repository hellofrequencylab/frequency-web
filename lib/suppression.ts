// Deliverability: the central email suppression list + event log (COMMS-CRM §2).
// The send path checks isSuppressed() before every send; the Resend webhook calls
// recordEmailEvent()/suppress(). Server-only. Tables land in 20240220000000;
// untyped client view until types are regenerated.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

function db(): SupabaseClient {
  return createAdminClient()
}

const norm = (email: string) => email.trim().toLowerCase()

/** True if the address must never be emailed (hard bounce / complaint / manual). */
export async function isSuppressed(email: string): Promise<boolean> {
  const { data } = await db()
    .from('email_suppressions')
    .select('email')
    .eq('email', norm(email))
    .maybeSingle()
  return !!data
}

/** Add an address to the suppression list (idempotent). */
export async function suppress(email: string, reason: string): Promise<void> {
  await db()
    .from('email_suppressions')
    .upsert({ email: norm(email), reason }, { onConflict: 'email', ignoreDuplicates: true })
}

/** Log a Resend delivery/engagement event. */
export async function recordEmailEvent(input: {
  email: string
  eventType: string
  providerId?: string | null
  payload?: Record<string, unknown>
}): Promise<void> {
  await db()
    .from('email_events')
    .insert({
      email: norm(input.email),
      event_type: input.eventType,
      provider_id: input.providerId ?? null,
      payload: input.payload ?? {},
    })
}
