// Trait refresh job (ADR-069 Phase 2). Pulls per-member aggregates from the
// member_engagement_stats RPC, runs the pure compute layer, and upserts the results
// into member_traits. Driven by the nightly cron (app/api/cron/refresh-traits).
// member_traits / the RPC aren't in database.types yet, so we cast (repo convention).

import { createAdminClient } from '@/lib/supabase/admin'
import {
  computeTraits,
  computeBehavioralTraits,
  computePredictiveTraits,
  computeResonanceTraits,
  computeRetentionTraits,
  predictiveInputs,
  resonanceHealthInputs,
  type ComputedTrait,
  type MemberStats,
  type InteractionStats,
} from './compute'

const ZERO_INTERACTION: InteractionStats = {
  lastInteractionAt: null, interactionCount30: 0, interactionDays30: 0,
  surfacesTouched30: 0, dwellMs30: 0, sessions30: 0, scrollDepthAvg: 0,
}

interface StatsRow {
  profile_id: string
  created_at: string | null
  last_event_at: string | null
  first_verified_practice_at: string | null
  distinct_active_days_30: number | null
  verified_practices_7d: number | null
  event_count_30d: number | null
  // Resonance Engine Phase 5 (ADR-386): the prior week's verified practices, the baseline the
  // decline_slope reads against. Optional — the stats RPC may not expose it yet, in which case
  // it is undefined and the slope reads 0 (no decline), exactly the Phase 3 "wired but 0 for now"
  // pattern (the unsubscribe term in the circuit breaker). When the RPC adds the column, the
  // slope lights up with no code change here.
  verified_practices_prev_7d?: number | null
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
  const db = createAdminClient()
  const { data, error } = await db.rpc('member_engagement_stats')
  if (error || !data) return { members: 0, traits: 0 }

  const rows = data as StatsRow[]
  const computedAt = now.toISOString()
  const nowMs = now.getTime()
  const upserts: ReturnType<typeof toRow>[] = []

  // Merge the two stat views (ledger + interaction firehose) by member, so each member's
  // ledger, behavioral, AND predicted traits are computed from one consistent picture.
  const { data: ix } = await db.rpc('member_interaction_stats', { _days: 30 })
  const engById = new Map(rows.map((r) => [r.profile_id, r]))
  const ixById = new Map(((ix ?? []) as InteractionStatsRow[]).map((r) => [r.profile_id, r]))

  const toInteractionStats = (r: InteractionStatsRow | undefined): InteractionStats =>
    r
      ? {
          lastInteractionAt: r.last_interaction_at,
          interactionCount30: r.interaction_count ?? 0,
          interactionDays30: r.active_days ?? 0,
          surfacesTouched30: r.surfaces ?? 0,
          dwellMs30: r.dwell_ms ?? 0,
          sessions30: r.sessions ?? 0,
          scrollDepthAvg: r.scroll_avg ?? 0,
        }
      : ZERO_INTERACTION

  const allIds = new Set<string>([...engById.keys(), ...ixById.keys()])
  for (const id of allIds) {
    const istats = toInteractionStats(ixById.get(id))
    // Behavioral features (PI.2) — for anyone with or without interactions.
    for (const c of computeBehavioralTraits(istats)) upserts.push(toRow(id, c, computedAt))

    // Ledger + predicted traits need the canonical member view (created_at, lifecycle).
    const er = engById.get(id)
    if (er) {
      const stats: MemberStats = {
        createdAt: er.created_at ?? computedAt,
        lastEventAt: er.last_event_at,
        firstVerifiedPracticeAt: er.first_verified_practice_at,
        distinctActiveDays30: er.distinct_active_days_30 ?? 0,
        verifiedPractices7d: er.verified_practices_7d ?? 0,
        eventCount30d: er.event_count_30d ?? 0,
      }
      for (const c of computeTraits(stats, nowMs)) upserts.push(toRow(id, c, computedAt))
      // Prediction layer (PI.3) — heuristic over the merged feature view.
      for (const c of computePredictiveTraits(predictiveInputs(stats, istats, nowMs))) {
        upserts.push(toRow(id, c, computedAt))
      }
      // Resonance Health (ADR-383) — the one shared dashboard score, rolled up from the
      // engagement/RFM/WAM/churn traits this same member just computed (no extra source).
      for (const c of computeResonanceTraits(resonanceHealthInputs(stats, istats, nowMs))) {
        upserts.push(toRow(id, c, computedAt))
      }
      // Retention signals (ADR-386) — decline_slope (week-over-week practice drop) +
      // notification_budget. The prior-week practice count rides the stats RPC when present
      // (else 0 -> slope 0, the "wired but 0 for now" pattern). The budget defaults to
      // `standard` here: the nightly batch does not pull per-member notification preferences,
      // so the playbooks read a member's live budget at action time; this trait is the calm
      // default. Both are PURE (lib/traits/compute.ts) + unit-tested.
      const cadence = {
        practiceThisWeek: er.verified_practices_7d ?? 0,
        practiceLastWeek: er.verified_practices_prev_7d ?? 0,
      }
      for (const c of computeRetentionTraits(cadence, {})) {
        upserts.push(toRow(id, c, computedAt))
      }
    }
  }

  if (upserts.length) {
    await db.from('member_traits').upsert(upserts, { onConflict: 'profile_id,trait_key' })
  }

  // Refresh the dashboard read layer (ADR-383) so the cockpit aggregates reflect tonight's
  // scores. Fail-safe: a missing matview / RPC (pre-migration) is swallowed, so a deploy
  // before the migration applies still completes the trait refresh, just with a stale (or
  // empty) dashboard until the matview exists. CONCURRENTLY so reads never block on it.
  try {
    // The wrapper RPC isn't in the generated types yet (ADR-246), so cast for the call.
    await (db as unknown as { rpc: (fn: string) => Promise<unknown> }).rpc('refresh_member_engagement_scores')
  } catch {
    /* dashboard matview absent or refresh failed; the cockpit degrades to its last snapshot. */
  }

  return { members: rows.length, traits: upserts.length }
}
