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
  source: string | null
  createdAt: string | null
}

const SELECT = 'id, email, display_name, consent_state, engagement_score, profile_id, source, created_at'

function mapRow(c: Record<string, unknown>): ContactRow {
  return {
    id: String(c.id),
    email: String(c.email),
    displayName: (c.display_name as string) ?? null,
    consentState: (c.consent_state as string) ?? 'unknown',
    engagementScore: Number(c.engagement_score ?? 0),
    profileId: (c.profile_id as string) ?? null,
    source: (c.source as string) ?? null,
    createdAt: (c.created_at as string) ?? null,
  }
}

export async function listContacts(limit = 100): Promise<ContactRow[]> {
  const db = createAdminClient() as unknown as SupabaseClient
  const { data } = await db
    .from('contacts')
    .select(SELECT)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map((c) => mapRow(c as Record<string, unknown>))
}

// Subscribed contacts (the marketing list — confirmed opt-ins).
export async function listSubscribers(limit = 500): Promise<ContactRow[]> {
  const db = createAdminClient() as unknown as SupabaseClient
  const { data } = await db
    .from('contacts')
    .select(SELECT)
    .eq('consent_state', 'subscribed')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map((c) => mapRow(c as Record<string, unknown>))
}
