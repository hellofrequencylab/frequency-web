// Retroactive reward rules (PI.5 / ADR-168) — the governed catalog of "reward past
// behavior" rules. Each rule is a PURE predicate over a member's durable history snapshot
// (the feature store + lifetime fields + tags the PI track banked) plus a fixed reward.
// A rule defined today grants against history already recorded — that's the whole point:
// you never needed the rule to exist when the behavior happened.
//
// Definitions here (reviewed in git); the idempotent grant + IO live in ./evaluate.ts.
// Same registry pattern as traits/site-actions. Pure + unit-tested.

import { rankIndex, type SeasonRank } from '@/lib/season-ranks'

export type RewardKind = 'gems' | 'zaps'

export interface MemberRewardSnapshot {
  profileId: string
  membershipTier: string
  lifetimeRank: SeasonRank | string | null
  lifetimeZaps: number
  /** member_traits values keyed by trait_key (string/number/null). */
  traits: Record<string, string | number | null>
  /** member_tags the profile holds. */
  tags: Set<string>
}

export interface RewardRule {
  key: string
  label: string
  description: string
  reward: { kind: RewardKind; amount: number }
  active: boolean
  /** Pure predicate over the durable snapshot. */
  match: (m: MemberRewardSnapshot) => boolean
}

const num = (v: string | number | null | undefined): number => (typeof v === 'number' ? v : Number(v ?? 0)) || 0

export const REWARD_RULES: readonly RewardRule[] = [
  {
    // Rule key stays `seasoned_agent` (stable grant identifier — renaming it would
    // orphan past idempotent grants); the rank it gates on is now Adept (completion-based
    // model, ADR-quest/rank — 2+ Journeys finished lifetime).
    key: 'seasoned_agent',
    label: 'Seasoned — reached Adept',
    description: 'Anyone who ever climbed to Adept or higher (locked lifetime rank). Rewards past seasons.',
    reward: { kind: 'gems', amount: 200 },
    active: true,
    match: (m) => rankIndex(m.lifetimeRank as SeasonRank) >= rankIndex('adept'),
  },
  {
    key: 'og_beta',
    label: 'Founding cohort',
    description: 'Members tagged from the web beta — a thank-you for being early.',
    reward: { kind: 'gems', amount: 50 },
    active: true,
    match: (m) => m.tags.has('web_beta'),
  },
  {
    key: 'supporter_thanks',
    label: 'Supporter thank-you',
    description: 'Supporters (pay-more tier) — a recurring gem thank-you for chipping in.',
    reward: { kind: 'gems', amount: 100 },
    active: true,
    match: (m) => m.membershipTier === 'supporter',
  },
  {
    key: 'deep_engager',
    label: 'Deep engager',
    description: 'Members whose behavioral depth band is "deep" — consistent, sustained on-site engagement.',
    reward: { kind: 'gems', amount: 75 },
    active: true,
    match: (m) => m.traits.engagement_depth === 'deep',
  },
  {
    key: 'loyal_30',
    label: 'Showed up all month',
    description: 'Active on 20+ distinct days in the last 30 — a stickiness reward.',
    reward: { kind: 'gems', amount: 100 },
    active: true,
    match: (m) => num(m.traits.interaction_days_30) >= 20,
  },
]

/** The active rules a member's durable history matches right now. */
export function rulesMatching(m: MemberRewardSnapshot): RewardRule[] {
  return REWARD_RULES.filter((r) => r.active && safeMatch(r, m))
}

function safeMatch(r: RewardRule, m: MemberRewardSnapshot): boolean {
  try {
    return r.match(m)
  } catch {
    return false
  }
}

export function getRewardRule(key: string): RewardRule | undefined {
  return REWARD_RULES.find((r) => r.key === key)
}
