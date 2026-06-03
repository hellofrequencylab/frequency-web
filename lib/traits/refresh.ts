// Trait refresh job (ADR-069 Phase 2). Pulls per-member aggregates from the
// member_engagement_stats RPC, runs the pure compute layer, and upserts the results
// into member_traits. Driven by the nightly cron (app/api/cron/refresh-traits).
// member_traits / the RPC aren't in database.types yet, so we cast (repo convention).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeTraits, type ComputedTrait, type MemberStats } from './compute'

interface StatsRow {
  profile_id: string
  created_at: string | null
  last_event_at: string | null
  first_verified_practice_at: string | null
  distinct_active_days_30: number | null
  verified_practices_7d: number | null
  event_count_30d: number | null
}

function toRow(profileId: string, c: ComputedTrait, computedAt: string) {
  return {
    profile_id: profileId,
    trait_key: c.key,
    value_num: c.type === 'number' ? (c.value as number) : null,
    value_text: c.type === 'string' || c.type === 'enum' ? (c.value as string | null) : null,
    value_ts: c.type === 'timestamp' ? (c.value as string | null) : null,
    value_bool: c.type === 'boolean' ? (c.value as boolean) : null,
    value_json: null,
    computed_at: computedAt,
  }
}

/** Recompute every member's traits from the ledger and upsert them. Idempotent;
 *  safe to run on any schedule. Returns counts for logging. */
export async function refreshMemberTraits(now: Date = new Date()): Promise<{ members: number; traits: number }> {
  const db = createAdminClient() as unknown as SupabaseClient
  const { data, error } = await db.rpc('member_engagement_stats')
  if (error || !data) return { members: 0, traits: 0 }

  const rows = data as StatsRow[]
  const computedAt = now.toISOString()
  const nowMs = now.getTime()
  const upserts: ReturnType<typeof toRow>[] = []

  for (const r of rows) {
    const stats: MemberStats = {
      createdAt: r.created_at ?? computedAt,
      lastEventAt: r.last_event_at,
      firstVerifiedPracticeAt: r.first_verified_practice_at,
      distinctActiveDays30: r.distinct_active_days_30 ?? 0,
      verifiedPractices7d: r.verified_practices_7d ?? 0,
      eventCount30d: r.event_count_30d ?? 0,
    }
    for (const c of computeTraits(stats, nowMs)) upserts.push(toRow(r.profile_id, c, computedAt))
  }

  if (upserts.length) {
    await db.from('member_traits').upsert(upserts, { onConflict: 'profile_id,trait_key' })
  }
  return { members: rows.length, traits: upserts.length }
}
