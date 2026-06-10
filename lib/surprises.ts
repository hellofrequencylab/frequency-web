// Surprises — variable-ratio, unannounced bonus rewards (ADR-210). The most
// engaging reward schedule is the variable one: a reward you can't predict the
// timing or the size of. A Surprise is exactly that, and it comes in two flavors,
// each capped to once per UTC day so neither can be farmed:
//   • GEMS — on the daily practice loop (the personal, online-ish habit). Gems are
//     cosmetic/spendable, so a lucky roll never touches the competitive ladder.
//   • ZAPS — on "appropriate behavior": the real-world / community acts that
//     legitimately earn Zaps (attend, host, refer, complete a task, scan a code;
//     ADR-139). Zaps drive season rank, so the variance here is small and tied to
//     genuine in-person participation, never to free idle luck. Amounts stay
//     modest relative to the base award for the act.
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

/** Chance that a given active day is a GEMS Surprise day (≈ once every ~4-5 logged
 *  days). Tunable; the variable schedule is the whole point. */
export const SURPRISE_DAILY_RATE = 0.22

/** Chance that a day is a ZAPS Surprise day, rolled per real-world act. Slightly
 *  lower than the gems rate since Zaps are weightier and touch season rank. */
export const ZAP_SURPRISE_RATE = 0.18

/** The real-world / community acts that may carry a Zap Surprise — the Zap-earning
 *  events (ADR-139). Practice logs are deliberately absent: they get the Gems
 *  Surprise instead, so a single act never fires both. Keyed by GamificationEvent
 *  `type`, so the chokepoint can pass `event.type` straight through. */
export const ZAP_SURPRISE_ACTS = new Set<string>([
  'event_attend',
  'event_host',
  'referral',
  'task_complete',
  'qr_scan',
])

export type SurpriseKind = 'gems' | 'zaps'
export type SurpriseTier = 'common' | 'rare' | 'gleam'

export interface Surprise {
  kind: SurpriseKind
  amount: number
  tier: SurpriseTier
  /** reward_grants idempotency key — one Surprise of this kind per member per day. */
  key: string
  /** Calm, member-facing line for the toast (CONTENT-VOICE: no hype, no em dash). */
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

function surpriseLabel(kind: SurpriseKind, tier: SurpriseTier, amount: number): string {
  const unit = kind === 'gems' ? 'gems' : 'zaps'
  switch (tier) {
    case 'gleam':
      return `A rare surprise. Plus ${amount} ${unit}.`
    case 'rare':
      return `A good surprise. Plus ${amount} ${unit}.`
    default:
      return `A small surprise. Plus ${amount} ${unit}.`
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
  return { kind: 'gems', amount, tier, key: `surprise:${day}`, label: surpriseLabel('gems', tier, amount) }
}

/** The ZAPS Surprise a member gets on `day`, or null if it isn't a Zap Surprise
 *  day for them. Independent of the gems roll (distinct seeds), so a day can carry
 *  one, both, or neither. Same deterministic + variable-on-two-axes design; amounts
 *  are smaller (common 3-6 / rare 12 / gleam 25) to stay modest against the base
 *  Zap award for the act, keeping rank variance gentle. */
export function rollZapSurprise(profileId: string, day: string): Surprise | null {
  if (!profileId || !day) return null
  const hit = hashUnit(`${SALT}|zhit|${profileId}|${day}`)
  if (hit >= ZAP_SURPRISE_RATE) return null

  const mag = hashUnit(`${SALT}|zmag|${profileId}|${day}`)
  let tier: SurpriseTier
  let amount: number
  if (mag < 0.04) {
    tier = 'gleam'
    amount = 25
  } else if (mag < 0.2) {
    tier = 'rare'
    amount = 12
  } else {
    tier = 'common'
    // 3-6 zaps, derived from the seed so it stays deterministic.
    amount = 3 + Math.floor(hashUnit(`${SALT}|zamt|${profileId}|${day}`) * 4)
  }
  return { kind: 'zaps', amount, tier, key: `surprise.zaps:${day}`, label: surpriseLabel('zaps', tier, amount) }
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

/** Fire the day's ZAP Surprise after an appropriate real-world act, if any. No-op
 *  for acts outside ZAP_SURPRISE_ACTS (so practice logs, posts, etc. never trigger
 *  it). Claim-then-pay: the reward_grants row is the one-per-member-per-day guard;
 *  the grant goes through awardZaps so the season-rank trigger + free-member rate
 *  apply exactly as a normal Zap award would. Returns the Surprise (for a future
 *  toast) or null. Best-effort — safe to call on the gamification chokepoint.
 *
 *  `actType` is the GamificationEvent `type`; `day` defaults to today (UTC). */
export async function fireZapSurpriseForAct(
  profileId: string,
  actType: string,
  day: string = new Date().toISOString().slice(0, 10),
): Promise<Surprise | null> {
  if (!ZAP_SURPRISE_ACTS.has(actType)) return null
  const surprise = rollZapSurprise(profileId, day)
  if (!surprise) return null

  const admin = db()
  const { error } = await admin.from('reward_grants').insert({
    rule_key: surprise.key,
    profile_id: profileId,
    reward_kind: 'zaps',
    amount: surprise.amount,
    detail: surprise.label,
  })
  // unique (rule_key, profile_id) violation = already surprised today / lost the race.
  if (error) return null

  // Grant through the canonical Zap path: the after_zap_transaction trigger advances
  // season totals + rank, and free-member rate scaling applies (ADR-140). Dynamic
  // import keeps this module free of the zaps/economy chain at load time.
  const { awardZaps } = await import('@/lib/zaps')
  await awardZaps(profileId, surprise.amount, {
    actionType: 'surprise_zaps',
    metadata: { rule: surprise.key, tier: surprise.tier },
  })
  return surprise
}
