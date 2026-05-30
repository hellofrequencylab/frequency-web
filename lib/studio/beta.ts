// Beta waitlist reads for the Studio. Beta signups are `contacts` with
// source='beta_waitlist'; status is derived from consent_state + meta.
// Server-only. `contacts` is untyped in generated types -> cast.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export type BetaStatus = 'pending' | 'confirmed' | 'invited' | 'unsubscribed'

export interface BetaSignup {
  id: string
  email: string
  displayName: string | null
  status: BetaStatus
  requestedAt: string | null
  confirmedAt: string | null
  invitedAt: string | null
}

function deriveStatus(consent: string | null, meta: Record<string, unknown> | null): BetaStatus {
  const m = meta ?? {}
  if (m.beta_status === 'invited') return 'invited'
  if (consent === 'unsubscribed') return 'unsubscribed'
  if (consent === 'subscribed' || m.double_optin === 'confirmed') return 'confirmed'
  return 'pending'
}

export async function listBetaSignups(): Promise<BetaSignup[]> {
  const db = createAdminClient() as unknown as SupabaseClient
  const { data } = await db
    .from('contacts')
    .select('id, email, display_name, consent_state, meta, created_at')
    .eq('source', 'beta_waitlist')
    .order('created_at', { ascending: false })
    .limit(1000)

  return (data ?? []).map((c: Record<string, unknown>) => {
    const meta = (c.meta && typeof c.meta === 'object' ? c.meta : {}) as Record<string, unknown>
    return {
      id: String(c.id),
      email: String(c.email),
      displayName: (c.display_name as string) ?? null,
      status: deriveStatus(c.consent_state as string, meta),
      requestedAt: (meta.requested_at as string) ?? (c.created_at as string) ?? null,
      confirmedAt: (meta.confirmed_at as string) ?? null,
      invitedAt: (meta.invited_at as string) ?? null,
    }
  })
}

export interface BetaStats {
  total: number
  pending: number
  confirmed: number
  invited: number
}

export function summarizeBeta(signups: BetaSignup[]): BetaStats {
  return {
    total: signups.length,
    pending: signups.filter((s) => s.status === 'pending').length,
    confirmed: signups.filter((s) => s.status === 'confirmed').length,
    invited: signups.filter((s) => s.status === 'invited').length,
  }
}
