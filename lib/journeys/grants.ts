// Journeys v2 — milestone reward grants (ADR-252, J3, JOURNEYS.md §4). Given the reward events
// the engine produced (rewards.ts) on a lesson completion, grant the Gems for each phase/journey
// milestone EXACTLY ONCE via the same claim-then-pay reward_grants idempotency the rest of the
// journey system uses. Gems are the on-platform reward; the celebration
// (the player) is the trophy moment. Server-only; best-effort (never blocks the check-off).

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { JourneyRewardEvent } from './rewards'

function db(): SupabaseClient {
  return createAdminClient()
}

/** Gems for finishing a phase (a slice of the journey). */
const PHASE_COMPLETE_GEMS = 10

export interface GrantedJourneyReward {
  kind: 'phase' | 'journey'
  gems: number
  label: string
}

/** Claim-then-pay: the unique (rule_key, profile_id) insert is the lock; only a fresh claim
 *  writes the gem ledger, so a redelivered/concurrent completion never double-pays. */
async function grantGemsOnce(
  admin: SupabaseClient,
  ruleKey: string,
  profileId: string,
  amount: number,
  label: string,
): Promise<boolean> {
  if (amount <= 0) return false
  const { error } = await admin
    .from('reward_grants')
    .insert({ rule_key: ruleKey, profile_id: profileId, reward_kind: 'gems', amount, detail: label })
  if (error) return false // already granted / lost the race
  await admin.from('gem_transactions').insert({
    profile_id: profileId,
    action_type: 'journey_reward',
    amount,
    metadata: { rule: ruleKey, label },
  })
  return true
}

/** Grant the Gems for the phase/journey milestones in `events` (idempotent). Returns what was
 *  NEWLY granted (for the celebration toast). */
export async function grantJourneyRewards(opts: {
  profileId: string
  completionGems: number
  events: readonly JourneyRewardEvent[]
}): Promise<GrantedJourneyReward[]> {
  const admin = db()
  const granted: GrantedJourneyReward[] = []
  for (const ev of opts.events) {
    if (ev.kind === 'phase_complete') {
      const label = `Phase complete${ev.phaseTitle ? `: ${ev.phaseTitle}` : ''}`
      if (await grantGemsOnce(admin, ev.idempotencyKey, opts.profileId, PHASE_COMPLETE_GEMS, label)) {
        granted.push({ kind: 'phase', gems: PHASE_COMPLETE_GEMS, label: ev.phaseTitle ?? 'Phase complete' })
      }
    } else if (ev.kind === 'journey_complete') {
      const amount = Math.max(0, Math.round(opts.completionGems || 30))
      if (await grantGemsOnce(admin, ev.idempotencyKey, opts.profileId, amount, 'Journey complete')) {
        granted.push({ kind: 'journey', gems: amount, label: 'Journey complete' })
      }
    }
  }
  return granted
}
