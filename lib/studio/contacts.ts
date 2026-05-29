// Studio CRM contact reads. Server-only; `contacts` lands in 20240221000000,
// untyped client view until types regenerate.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export interface ContactRow {
  id: string
  email: string
  displayName: string | null
  consentState: string
  engagementScore: number
  profileId: string | null
  createdAt: string | null
}

export async function listContacts(limit = 100): Promise<ContactRow[]> {
  const db = createAdminClient() as unknown as SupabaseClient
  const { data } = await db
    .from('contacts')
    .select('id, email, display_name, consent_state, engagement_score, profile_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map((c) => ({
    id: c.id,
    email: c.email,
    displayName: c.display_name ?? null,
    consentState: c.consent_state ?? 'unknown',
    engagementScore: Number(c.engagement_score ?? 0),
    profileId: c.profile_id ?? null,
    createdAt: c.created_at ?? null,
  }))
}
