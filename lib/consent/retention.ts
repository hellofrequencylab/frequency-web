// Retention enforcement (ADR-069 Phase 5b). Purges data past its useful life: expired
// member tags (those with an `expires_at` in the past) and the raw interaction firehose
// past its window (PI.1 — high-volume, retention-bounded; the PI.2 rollups keep the
// durable aggregate). Extensible to computed traits with a finite `retentionDays`.
// Driven by a nightly cron. member_tags / interaction_events aren't in database.types
// yet (cast, repo convention).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

/** How long raw interaction_events rows are kept before purge (PI.1). The durable
 *  signal lives in the PI.2 rollups; the raw firehose is a short-window working set. */
export const INTERACTION_RETENTION_DAYS = 90

/** Pure: has an `expires_at` passed as of `now`? Null = never expires. Unit-tested. */
export function isExpired(expiresAt: string | null, now: number): boolean {
  if (!expiresAt) return false
  const t = Date.parse(expiresAt)
  return !Number.isNaN(t) && t < now
}

function db(): SupabaseClient {
  return createAdminClient()
}

/** Delete data past its window: expired member tags + raw interaction_events older than
 *  INTERACTION_RETENTION_DAYS. Returns how many of each were purged. */
export async function enforceRetention(now: Date = new Date()): Promise<{ tagsPurged: number; interactionsPurged: number }> {
  const { data: tags } = await db()
    .from('member_tags')
    .delete()
    .lt('expires_at', now.toISOString())
    .not('expires_at', 'is', null)
    .select('profile_id')

  const cutoff = new Date(now.getTime() - INTERACTION_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const { data: interactions } = await db()
    .from('interaction_events')
    .delete()
    .lt('created_at', cutoff.toISOString())
    .select('id')

  return { tagsPurged: (tags ?? []).length, interactionsPurged: (interactions ?? []).length }
}
