// Consent ledger access (ADR-069 Phase 5b). The append-only `consent_records` table
// is the source of truth; the CURRENT state for a scope is the latest record. This is
// the consent half of the ADR-028 harness — `hasConsent` is what AI writes gate on.
// consent_records isn't in database.types yet (cast, repo convention).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { defaultGranted } from './scopes'

export interface ConsentRecord {
  scope: string
  granted: boolean
  created_at: string
}

/** Pure: collapse an append-only log to the current granted-state per scope (latest
 *  record wins). Unit-tested. */
export function latestByScope(records: ConsentRecord[]): Map<string, boolean> {
  const latest = new Map<string, { granted: boolean; at: number }>()
  for (const r of records) {
    const at = Date.parse(r.created_at)
    const prev = latest.get(r.scope)
    if (!prev || at >= prev.at) latest.set(r.scope, { granted: r.granted, at })
  }
  return new Map([...latest].map(([scope, v]) => [scope, v.granted]))
}

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

/** Record a consent choice (append-only). */
export async function recordConsent(
  profileId: string,
  scope: string,
  granted: boolean,
  source = 'member',
): Promise<void> {
  await db().from('consent_records').insert({ profile_id: profileId, scope, granted, source })
}

/** Whether a member currently consents to a scope. Falls back to the scope's default
 *  when they've never recorded a choice. Fail-closed on error. */
export async function hasConsent(profileId: string, scope: string): Promise<boolean> {
  try {
    const { data } = await db()
      .from('consent_records')
      .select('scope, granted, created_at')
      .eq('profile_id', profileId)
      .eq('scope', scope)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return defaultGranted(scope)
    return (data as ConsentRecord).granted
  } catch {
    return false
  }
}
