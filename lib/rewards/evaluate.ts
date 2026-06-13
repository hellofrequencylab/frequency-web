// Retroactive reward evaluator (PI.5 / ADR-168). Walks every member's durable history
// snapshot, finds the reward rules they match, and grants each ONCE — idempotently,
// against the immutable history the PI track banked. Re-runnable on any schedule: the
// reward_grants unique (rule, member) is the hard backstop, and we claim-before-pay so a
// double run never double-grants. Server-only (admin client). The reward lands in the
// existing gem/zap ledger (its trigger keeps the profile totals in lockstep).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { REWARD_RULES, rulesMatching, type MemberRewardSnapshot, type RewardKind } from './rules'

export interface RuleTally {
  key: string
  label: string
  /** Members who match but haven't been granted yet (the pending grant). */
  pending: number
  /** Members already granted in a prior run. */
  granted: number
}

export interface RewardRunResult {
  dryRun: boolean
  members: number
  newGrants: number
  gemsAwarded: number
  zapsAwarded: number
  byRule: RuleTally[]
}

function db(): SupabaseClient {
  return createAdminClient()
}

/** Build every member's durable snapshot from profiles + member_traits + member_tags. */
async function gatherSnapshots(admin: SupabaseClient): Promise<MemberRewardSnapshot[]> {
  const [profiles, traits, tags] = await Promise.all([
    admin.from('profiles').select('id, membership_tier, lifetime_rank, lifetime_zaps').eq('is_system', false).eq('is_active', true),
    admin.from('member_traits').select('profile_id, trait_key, value_num, value_text'),
    admin.from('member_tags').select('profile_id, tag_key'),
  ])

  const traitsByMember = new Map<string, Record<string, string | number | null>>()
  for (const r of (traits.data as { profile_id: string; trait_key: string; value_num: number | null; value_text: string | null }[] | null) ?? []) {
    const m = traitsByMember.get(r.profile_id) ?? {}
    m[r.trait_key] = r.value_text ?? r.value_num
    traitsByMember.set(r.profile_id, m)
  }
  const tagsByMember = new Map<string, Set<string>>()
  for (const r of (tags.data as { profile_id: string; tag_key: string }[] | null) ?? []) {
    const s = tagsByMember.get(r.profile_id) ?? new Set<string>()
    s.add(r.tag_key)
    tagsByMember.set(r.profile_id, s)
  }

  return ((profiles.data as { id: string; membership_tier: string | null; lifetime_rank: string | null; lifetime_zaps: number | null }[] | null) ?? []).map((p) => ({
    profileId: p.id,
    membershipTier: p.membership_tier ?? 'free',
    lifetimeRank: p.lifetime_rank,
    lifetimeZaps: p.lifetime_zaps ?? 0,
    traits: traitsByMember.get(p.id) ?? {},
    tags: tagsByMember.get(p.id) ?? new Set<string>(),
  }))
}

/**
 * Evaluate every rule against every member and grant the matches once.
 * `dryRun` computes the same tally without writing — for the operator preview.
 */
export async function evaluateRetroRewards(opts: { dryRun?: boolean } = {}): Promise<RewardRunResult> {
  const dryRun = opts.dryRun ?? false
  const admin = db()

  const [snapshots, existing] = await Promise.all([
    gatherSnapshots(admin),
    admin.from('reward_grants').select('rule_key, profile_id'),
  ])

  // The set of (rule, member) already granted — the idempotency check.
  const grantedSet = new Set<string>()
  for (const r of (existing.data as { rule_key: string; profile_id: string }[] | null) ?? []) {
    grantedSet.add(`${r.rule_key}:${r.profile_id}`)
  }

  const tally = new Map<string, RuleTally>(
    REWARD_RULES.map((r) => [r.key, { key: r.key, label: r.label, pending: 0, granted: 0 }]),
  )
  let newGrants = 0
  let gemsAwarded = 0
  let zapsAwarded = 0

  for (const m of snapshots) {
    for (const rule of rulesMatching(m)) {
      const t = tally.get(rule.key)!
      const id = `${rule.key}:${m.profileId}`
      if (grantedSet.has(id)) {
        t.granted += 1
        continue
      }
      t.pending += 1
      if (dryRun) continue

      const ok = await grantOnce(admin, rule.key, m.profileId, rule.reward.kind, rule.reward.amount, rule.label)
      if (ok) {
        newGrants += 1
        if (rule.reward.kind === 'gems') gemsAwarded += rule.reward.amount
        else zapsAwarded += rule.reward.amount
        grantedSet.add(id)
        t.granted += 1
        t.pending -= 1
      }
    }
  }

  return {
    dryRun,
    members: snapshots.length,
    newGrants,
    gemsAwarded,
    zapsAwarded,
    byRule: [...tally.values()],
  }
}

/** Claim-then-pay: insert the idempotency row first; only on a fresh claim grant the
 *  ledger reward. A concurrent run loses the unique race and never double-pays. */
async function grantOnce(
  admin: SupabaseClient,
  ruleKey: string,
  profileId: string,
  kind: RewardKind,
  amount: number,
  label: string,
): Promise<boolean> {
  const { error: claimErr } = await admin.from('reward_grants').insert({
    rule_key: ruleKey,
    profile_id: profileId,
    reward_kind: kind,
    amount,
    detail: label,
  })
  if (claimErr) return false // unique violation = already granted (or another run won)

  const ledger = kind === 'gems' ? 'gem_transactions' : 'zap_transactions'
  await admin.from(ledger).insert({
    profile_id: profileId,
    action_type: 'retro_reward',
    amount,
    metadata: { rule: ruleKey },
  })
  return true
}
