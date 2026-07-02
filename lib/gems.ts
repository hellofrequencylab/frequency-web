// Community Gems award engine.
// Handles daily-capped micro-rewards for platform engagement.
// Called from server actions after user interactions.

import { createAdminClient } from '@/lib/supabase/admin'

type GemAction =
  | 'post_create'
  | 'comment_reply'
  | 'reaction'
  | 'daily_login'
  | 'welcome_member'
  | 'event_rsvp'
  | 'circle_join'
  | 'achievement'
  // 'quest_complete' kept for historical continuity; the feature is now an "Arc" (see THE-QUEST.md).
  | 'quest_complete'
  | 'challenge_complete'
  | 'season_convert'
  // Creation rewards (Rewards Economy v3 / ADR-305, lib/rewards/creation.ts):
  // the small Gem token on first publish, and the Gem bonus on first validated use.
  | 'create_journey_token'
  | 'create_event_token'
  | 'create_practice_token'
  | 'create_journey_bonus'
  | 'create_event_bonus'
  | 'create_practice_bonus'
  // The season capstone Certificate bonus (lib/quest/complete.ts).
  | 'certificate_bonus'
  // Gift Gems sink (Rewards Economy v3 / ADR-305, lib/rewards/gifts.ts): credits the
  // RECIPIENT's gem ledger (raising their lifetime_gems). The giver's spendable balance
  // falls via the gem_gifts sink in lib/store/balance, not a debit ledger row.
  | 'gift_received'
  // Spark variable layer (Rewards Economy v3 / ADR-305, lib/rewards/spark.ts): the
  // capped, low-frequency surprise Gem bonus on top of the deterministic base.
  | 'spark_bonus'

interface AwardResult {
  awarded: boolean
  amount: number
  capped: boolean
}

export async function awardGems(
  profileId: string,
  action: GemAction,
  overrideAmount?: number,
  metadata?: Record<string, unknown>,
): Promise<AwardResult> {
  const admin = createAdminClient()

  const { data: config } = await admin
    .from('gem_config')
    .select('gems_amount, daily_cap, is_active')
    .eq('action_type', action)
    .maybeSingle()

  if (!config?.is_active) return { awarded: false, amount: 0, capped: false }

  const amount = overrideAmount ?? config.gems_amount
  if (amount <= 0) return { awarded: false, amount: 0, capped: false }

  // Atomic cap-check + insert under a per-(profile, action) advisory lock
  // (award_gems_atomic, migration 20260929000000, UTC day boundary). The prior
  // count-then-insert here was a race: N concurrent awards at cap-1 all read the same count
  // and all inserted, over-paying past daily_cap. The RPC is not in the generated types yet,
  // so the call is cast (repo convention for not-yet-typed DB objects).
  const rpc = admin.rpc as unknown as (
    name: 'award_gems_atomic',
    args: { _profile: string; _action: string; _amount: number; _daily_cap: number | null; _metadata: Record<string, unknown> },
  ) => Promise<{ data: { awarded?: boolean; capped?: boolean } | null; error: { message: string } | null }>

  const { data, error } = await rpc('award_gems_atomic', {
    _profile: profileId,
    _action: action,
    _amount: amount,
    _daily_cap: config.daily_cap ?? null,
    _metadata: metadata ?? {},
  })

  if (error) {
    console.error('[awardGems]', error.message)
    return { awarded: false, amount: 0, capped: false }
  }

  const awarded = !!data?.awarded
  return { awarded, amount: awarded ? amount : 0, capped: !!data?.capped }
}

// Gem tiers (New → Legend) are RETIRED (Rewards Economy v2): Amplitude levels
// (lib/amplitude.ts) are the lifetime progression layer now. Gems are purely
// spendable currency.
