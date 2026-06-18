// Community Gems award engine.
// Handles daily-capped micro-rewards for platform engagement.
// Called from server actions after user interactions.

import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'

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

  if (config.daily_cap != null) {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { count } = await admin
      .from('gem_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profileId)
      .eq('action_type', action)
      .gte('created_at', todayStart.toISOString())

    if ((count ?? 0) >= config.daily_cap) {
      return { awarded: false, amount: 0, capped: true }
    }
  }

  const { error } = await admin.from('gem_transactions').insert({
    profile_id: profileId,
    action_type: action,
    amount,
    metadata: (metadata ?? {}) as Database['public']['Tables']['gem_transactions']['Insert']['metadata'],
  })

  if (error) {
    console.error('[awardGems]', error.message)
    return { awarded: false, amount: 0, capped: false }
  }

  return { awarded: true, amount, capped: false }
}

// Gem tiers (New → Legend) are RETIRED (Rewards Economy v2): Amplitude levels
// (lib/amplitude.ts) are the lifetime progression layer now. Gems are purely
// spendable currency.
