// Surprises — variable-ratio, unannounced bonus Gems on the daily practice loop
// (ADR-210). The most engaging reward schedule is the variable one: a reward you
// can't predict the timing or the size of. A Surprise is exactly that — on any
// successful practice log there is a chance of a small bonus, at most once per
// day, paid in GEMS ONLY so a lucky roll can never distort the competitive season
// Zap/rank ladder.
//
// Two properties make it safe to fire on the hot log path:
//   1. Deterministic. The roll + amount are pure functions of (profileId, day),
//      so re-processing the same log yields the same outcome (idempotent before
//      the DB guard even runs).
//   2. Unfarmable. One roll per UTC day, claimed once via reward_grants
//      (UNIQUE rule_key+profile_id). Logging more times the same day can't re-roll
//      or double-pay.
//
// "Secret" by design: the odds are intentionally undisclosed (a published table
// would kill the surprise), so this stays a git/technical decision — no operator
// page describing the rates.
//
// Server-only. Never throws into the log hot path (the caller guards it too).

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

const SALT = 'frequency.surprise.v1'

/** Chance that a given active day is a Surprise day (≈ once every ~4-5 logged
 *  days). Tunable; the variable schedule is the whole point. */
export const SURPRISE_DAILY_RATE = 0.22

export type SurpriseTier = 'common' | 'rare' | 'gleam'

export interface Surprise {
  amount: number
  tier: SurpriseTier
  /** reward_grants idempotency key — one Surprise per member per day. */
  key: string
  /** Calm, member-facing line for the log toast (CONTENT-VOICE: no hype, no em dash). */
  label: string
}

/** Deterministic string → [0,1). FNV-1a 32-bit with a mulberry32 finalizer for a
 *  clean avalanche (similar (profile, day) strings must land far apart). This is a
 *  game roll, not a security primitive — no crypto dependency needed. */
function hashUnit(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h = (h + 0x6d2b79f5) | 0
  let t = Math.imul(h ^ (h >>> 15), 1 | h)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 0x100000000
}

function surpriseLabel(tier: SurpriseTier, amount: number): string {
  switch (tier) {
    case 'gleam':
      return `A rare surprise. Plus ${amount} gems.`
    case 'rare':
      return `A good surprise. Plus ${amount} gems.`
    default:
      return `A small surprise. Plus ${amount} gems.`
  }
}

/** The Surprise a member gets on `day` (YYYY-MM-DD), or null if it isn't a
 *  Surprise day for them. Pure + deterministic: same inputs, same result. Both the
 *  timing (is it a Surprise day) and the magnitude (which tier) are independently
 *  rolled, so the reward is variable on two axes. */
export function rollSurprise(profileId: string, day: string): Surprise | null {
  if (!profileId || !day) return null
  const hit = hashUnit(`${SALT}|hit|${profileId}|${day}`)
  if (hit >= SURPRISE_DAILY_RATE) return null

  const mag = hashUnit(`${SALT}|mag|${profileId}|${day}`)
  let tier: SurpriseTier
  let amount: number
  if (mag < 0.04) {
    tier = 'gleam'
    amount = 50
  } else if (mag < 0.2) {
    tier = 'rare'
    amount = 25
  } else {
    tier = 'common'
    // 6-12 gems, also derived from the seed so it stays deterministic.
    amount = 6 + Math.floor(hashUnit(`${SALT}|amt|${profileId}|${day}`) * 7)
  }
  return { amount, tier, key: `surprise:${day}`, label: surpriseLabel(tier, amount) }
}

/** Fire the day's Surprise after a fresh practice log, if any. Claim-then-pay: the
 *  reward_grants row is the idempotency guard (one per member per day); only a
 *  fresh claim writes the gem ledger. Returns the Surprise for the toast, or null.
 *  Best-effort — safe to call on every successful log. */
export async function fireSurpriseForLog(profileId: string, day: string): Promise<Surprise | null> {
  const surprise = rollSurprise(profileId, day)
  if (!surprise) return null

  const admin = db()
  const { error } = await admin.from('reward_grants').insert({
    rule_key: surprise.key,
    profile_id: profileId,
    reward_kind: 'gems',
    amount: surprise.amount,
    detail: surprise.label,
  })
  // unique (rule_key, profile_id) violation = already surprised today / lost the race.
  if (error) return null

  await admin.from('gem_transactions').insert({
    profile_id: profileId,
    action_type: 'surprise_gems',
    amount: surprise.amount,
    metadata: { rule: surprise.key, tier: surprise.tier },
  })
  return surprise
}
