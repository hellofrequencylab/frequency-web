import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentSeason } from '@/lib/seasons'
import type { AchievementTier } from '@/lib/gamification'
import type { RewardRow } from './reward-config'

// Data for the in-place Gamification module (ADR-138 — Engage): the stat summary +
// what the management controls (SeasonControl / AwardDialog / RewardConfig) need.
// Mirrors the /admin/gamification page load (the page can adopt this to DRY); the
// full achievement/challenge catalogs stay on the page (linked from the module).

type ZapCfgRow = { action_type: string; zaps_amount: number; daily_cap: number | null; is_active: boolean; description: string | null }
type GemCfgRow = { action_type: string; gems_amount: number; daily_cap: number | null; is_active: boolean; description: string | null }

export type GamificationData = {
  stats: { achievements: number; unlocked: number; challenges: number; completed: number }
  season: Awaited<ReturnType<typeof getCurrentSeason>>
  awardAchievements: { id: string; name: string; tier: AchievementTier }[]
  members: { id: string; display_name: string; handle: string }[]
  zapRewards: RewardRow[]
  gemRewards: RewardRow[]
}

export async function getGamificationData(isJanitor: boolean): Promise<GamificationData> {
  const admin = createAdminClient()

  const [
    { count: totalAchievements },
    { count: totalUnlocked },
    { count: totalChallenges },
    { count: totalChallengesCompleted },
    { data: achievements },
    { data: allMembers },
  ] = await Promise.all([
    admin.from('achievements').select('id', { count: 'exact', head: true }),
    admin.from('user_achievements').select('id', { count: 'exact', head: true }),
    admin.from('season_challenges').select('id', { count: 'exact', head: true }),
    admin.from('challenge_progress').select('id', { count: 'exact', head: true }).not('completed_at', 'is', null),
    admin.from('achievements').select('id, name, tier').order('sort_order'),
    admin.from('profiles').select('id, display_name, handle').eq('is_active', true).order('display_name').limit(200),
  ])

  const season = await getCurrentSeason()

  let zapRewards: RewardRow[] = []
  let gemRewards: RewardRow[] = []
  if (isJanitor) {
    const cfg = admin as unknown as SupabaseClient
    const [{ data: zapRows }, { data: gemRows }] = await Promise.all([
      cfg.from('zap_config').select('action_type, zaps_amount, daily_cap, is_active, description').order('action_type'),
      cfg.from('gem_config').select('action_type, gems_amount, daily_cap, is_active, description').order('action_type'),
    ])
    zapRewards = ((zapRows as ZapCfgRow[] | null) ?? []).map((r) => ({
      action_type: r.action_type, amount: r.zaps_amount, daily_cap: r.daily_cap, is_active: r.is_active, description: r.description,
    }))
    gemRewards = ((gemRows as GemCfgRow[] | null) ?? []).map((r) => ({
      action_type: r.action_type, amount: r.gems_amount, daily_cap: r.daily_cap, is_active: r.is_active, description: r.description,
    }))
  }

  return {
    stats: {
      achievements: totalAchievements ?? 0,
      unlocked: totalUnlocked ?? 0,
      challenges: totalChallenges ?? 0,
      completed: totalChallengesCompleted ?? 0,
    },
    season,
    awardAchievements: (achievements ?? []) as { id: string; name: string; tier: AchievementTier }[],
    members: (allMembers ?? []) as { id: string; display_name: string; handle: string }[],
    zapRewards,
    gemRewards,
  }
}
