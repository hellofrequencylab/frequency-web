// Trait refresh job (ADR-069 Phase 2). Pulls per-member aggregates from the
// member_engagement_stats RPC, runs the pure compute layer, and upserts the results
// into member_traits. Driven by the nightly cron (app/api/cron/refresh-traits).
// member_traits / the RPC aren't in database.types yet, so we cast (repo convention).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  computeTraits,
  computeBehavioralTraits,
  type ComputedTrait,
  type MemberStats,
  type InteractionStats,
} from './compute'

interface StatsRow {
  profile_id: string
  created_at: string | null
  last_event_at: string | null
  first_verified_practice_at: string | null
  distinct_active_days_30: number | null
  verified_practices_7d: number | null
  event_count_30d: number | null
}

interface InteractionStatsRow {
  profile_id: string
  last_interaction_at: string | null
  interaction_count: number | null
  active_days: number | null
  surfaces: number | null
  dwell_ms: number | null
  sessions: number | null
  scroll_avg: number | null
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

  // Behavioral feature store (PI.2) — fold the raw interaction firehose aggregates into
  // the same member_traits projection. Best-effort: a missing RPC/empty firehose just
  // skips this pass (the ledger traits above still upsert).
  const { data: ix } = await db.rpc('member_interaction_stats', { _days: 30 })
  for (const r of (ix ?? []) as InteractionStatsRow[]) {
    const istats: InteractionStats = {
      lastInteractionAt: r.last_interaction_at,
      interactionCount30: r.interaction_count ?? 0,
      interactionDays30: r.active_days ?? 0,
      surfacesTouched30: r.surfaces ?? 0,
      dwellMs30: r.dwell_ms ?? 0,
      sessions30: r.sessions ?? 0,
      scrollDepthAvg: r.scroll_avg ?? 0,
    }
    for (const c of computeBehavioralTraits(istats)) upserts.push(toRow(r.profile_id, c, computedAt))
  }

  if (upserts.length) {
    await db.from('member_traits').upsert(upserts, { onConflict: 'profile_id,trait_key' })
  }
  return { members: rows.length, traits: upserts.length }
}
