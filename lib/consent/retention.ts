// Retention enforcement (ADR-069 Phase 5b). Purges data past its useful life — today,
// expired member tags (those with an `expires_at` in the past). Extensible to computed
// traits with a finite `retentionDays` in the registry. Driven by a nightly cron.
// member_tags isn't in database.types yet (cast, repo convention).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

/** Pure: has an `expires_at` passed as of `now`? Null = never expires. Unit-tested. */
export function isExpired(expiresAt: string | null, now: number): boolean {
  if (!expiresAt) return false
  const t = Date.parse(expiresAt)
  return !Number.isNaN(t) && t < now
}

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

/** Delete member tags whose expiry has passed. Returns how many were purged. */
export async function enforceRetention(now: Date = new Date()): Promise<{ tagsPurged: number }> {
  const { data } = await db()
    .from('member_tags')
    .delete()
    .lt('expires_at', now.toISOString())
    .not('expires_at', 'is', null)
    .select('profile_id')
  return { tagsPurged: (data ?? []).length }
}
