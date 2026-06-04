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

export const GEM_TIER_THRESHOLDS = [
  { min: 0,     label: 'New',      color: 'bg-gray-300 dark:bg-gray-600' },
  { min: 100,   label: 'Active',   color: 'bg-blue-400' },
  { min: 500,   label: 'Regular',  color: 'bg-green-500' },
  { min: 2000,  label: 'Veteran',  color: 'bg-amber-500' },
  { min: 10000, label: 'Legend',   color: 'bg-violet-500' },
] as const

export function getGemTier(gems: number) {
  for (let i = GEM_TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (gems >= GEM_TIER_THRESHOLDS[i].min) return GEM_TIER_THRESHOLDS[i]
  }
  return GEM_TIER_THRESHOLDS[0]
}
