'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AchievementCategory, AchievementTier, StreakType } from '@/lib/gamification'

async function getMyProfileId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  return data?.id ?? null
}

// ---------------------------------------------------------------------------
// Fetch achievements page data
// ---------------------------------------------------------------------------

export async function getAchievementsData() {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  const admin = createAdminClient()

  const [
    { data: achievements },
    { data: userAchievements },
    { data: profile },
  ] = await Promise.all([
    admin.from('achievements').select('*').order('sort_order'),
    admin.from('user_achievements')
      .select('achievement_id, unlocked_at')
      .eq('profile_id', profileId),
    admin.from('profiles')
      .select('achievement_count, lifetime_zaps, current_streak, longest_streak')
      .eq('id', profileId)
      .maybeSingle(),
  ])

  const earnedMap = new Map(
    (userAchievements ?? []).map(ua => [ua.achievement_id, ua.unlocked_at])
  )

  return {
    achievements: (achievements ?? []).map(a => ({
      ...a,
      category: a.category as AchievementCategory,
      tier: a.tier as AchievementTier,
      earned: earnedMap.has(a.id),
      unlockedAt: earnedMap.get(a.id) ?? null,
    })),
    stats: {
      total: (achievements ?? []).length,
      earned: earnedMap.size,
      achievementCount: (profile as any)?.achievement_count ?? 0,
      lifetimeZaps: (profile as any)?.lifetime_zaps ?? 0,
      currentStreak: (profile as any)?.current_streak ?? 0,
      longestStreak: (profile as any)?.longest_streak ?? 0,
    },
  }
}

// ---------------------------------------------------------------------------
// Fetch streaks data
// ---------------------------------------------------------------------------

export async function getStreaksData() {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  const admin = createAdminClient()
  const { data: streaks } = await admin
    .from('streaks')
    .select('*')
    .eq('profile_id', profileId)

  return (streaks ?? []).map(s => ({
    ...s,
    streak_type: s.streak_type as StreakType,
  }))
}

// ---------------------------------------------------------------------------
// Fetch season challenges with progress
// ---------------------------------------------------------------------------

export async function getChallengesData(season: number = 1) {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  const admin = createAdminClient()

  const [
    { data: challenges },
    { data: progress },
  ] = await Promise.all([
    admin.from('season_challenges')
      .select('*')
      .eq('season', season)
      .order('sort_order'),
    admin.from('challenge_progress')
      .select('challenge_id, current, completed_at')
      .eq('profile_id', profileId),
  ])

  const progressMap = new Map(
    (progress ?? []).map(p => [p.challenge_id, p])
  )

  return {
    challenges: (challenges ?? []).map(c => {
      const p = progressMap.get(c.id)
      return {
        ...c,
        current: p?.current ?? 0,
        completedAt: p?.completed_at ?? null,
      }
    }),
    stats: {
      total: (challenges ?? []).length,
      completed: (progress ?? []).filter(p => p.completed_at).length,
    },
  }
}

// ---------------------------------------------------------------------------
// Fetch profile gamification summary (for sidebar/profile page)
// ---------------------------------------------------------------------------

export async function getGamificationSummary(profileId?: string) {
  const resolvedId = profileId ?? await getMyProfileId()
  if (!resolvedId) return null

  const admin = createAdminClient()

  const [
    { data: profile },
    { data: recentAchievements },
    { data: streaks },
  ] = await Promise.all([
    admin.from('profiles')
      .select('achievement_count, lifetime_zaps, current_streak, longest_streak, current_season_zaps, current_season_rank')
      .eq('id', resolvedId)
      .maybeSingle(),
    admin.from('user_achievements')
      .select('achievement_id, unlocked_at, achievement:achievements(name, icon, tier)')
      .eq('profile_id', resolvedId)
      .order('unlocked_at', { ascending: false })
      .limit(5),
    admin.from('streaks')
      .select('streak_type, current_count, longest_count')
      .eq('profile_id', resolvedId),
  ])

  return {
    achievementCount: (profile as any)?.achievement_count ?? 0,
    lifetimeZaps: (profile as any)?.lifetime_zaps ?? 0,
    currentStreak: (profile as any)?.current_streak ?? 0,
    longestStreak: (profile as any)?.longest_streak ?? 0,
    seasonZaps: (profile as any)?.current_season_zaps ?? 0,
    seasonRank: (profile as any)?.current_season_rank ?? 'ghost',
    recentAchievements: (recentAchievements ?? []).map(ra => ({
      achievementId: ra.achievement_id,
      unlockedAt: ra.unlocked_at,
      name: (ra.achievement as any)?.name ?? '',
      icon: (ra.achievement as any)?.icon ?? 'award',
      tier: ((ra.achievement as any)?.tier ?? 'bronze') as AchievementTier,
    })),
    streaks: (streaks ?? []).map(s => ({
      type: s.streak_type as StreakType,
      current: s.current_count,
      longest: s.longest_count,
    })),
  }
}

// ---------------------------------------------------------------------------
// Check for recently unlocked achievements (for toast display)
// ---------------------------------------------------------------------------

export async function checkRecentUnlocks(sinceIso: string) {
  const profileId = await getMyProfileId()
  if (!profileId) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('user_achievements')
    .select('achievement_id, unlocked_at, achievement:achievements(id, name, description, icon, tier, zaps_reward)')
    .eq('profile_id', profileId)
    .gte('unlocked_at', sinceIso)
    .order('unlocked_at', { ascending: true })

  return (data ?? []).map(row => {
    const a = row.achievement as any
    return {
      id: a?.id ?? row.achievement_id,
      name: a?.name ?? '',
      description: a?.description ?? '',
      icon: a?.icon ?? 'award',
      tier: (a?.tier ?? 'bronze') as AchievementTier,
      zapsReward: a?.zaps_reward ?? 0,
    }
  })
}

// ---------------------------------------------------------------------------
// Admin: manually award an achievement to a profile
// ---------------------------------------------------------------------------

export async function awardAchievement(profileId: string, achievementId: string) {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) throw new Error('Not authenticated')

  const admin = createAdminClient()

  // Check caller is host+
  const { data: caller } = await admin
    .from('profiles')
    .select('community_role')
    .eq('id', myProfileId)
    .maybeSingle()

  const role = (caller as any)?.community_role ?? 'member'
  if (!['host', 'guide', 'mentor', 'janitor'].includes(role)) {
    throw new Error('Unauthorized')
  }

  // Check not already earned
  const { data: existing } = await admin
    .from('user_achievements')
    .select('id')
    .eq('profile_id', profileId)
    .eq('achievement_id', achievementId)
    .maybeSingle()

  if (existing) return { alreadyEarned: true }

  const { error } = await admin.from('user_achievements').insert({
    profile_id: profileId,
    achievement_id: achievementId,
  })

  if (error) throw new Error(error.message)
  return { alreadyEarned: false }
}

// ---------------------------------------------------------------------------
// Admin: revoke an achievement from a profile
// ---------------------------------------------------------------------------

export async function revokeAchievement(profileId: string, achievementId: string) {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) throw new Error('Not authenticated')

  const admin = createAdminClient()

  const { data: caller } = await admin
    .from('profiles')
    .select('community_role')
    .eq('id', myProfileId)
    .maybeSingle()

  const role = (caller as any)?.community_role ?? 'member'
  if (!['host', 'guide', 'mentor', 'janitor'].includes(role)) {
    throw new Error('Unauthorized')
  }

  await admin
    .from('user_achievements')
    .delete()
    .eq('profile_id', profileId)
    .eq('achievement_id', achievementId)

  // Decrement counter
  const { data: profile } = await admin
    .from('profiles')
    .select('achievement_count')
    .eq('id', profileId)
    .maybeSingle()

  if (profile) {
    await admin
      .from('profiles')
      .update({ achievement_count: Math.max(0, ((profile as any).achievement_count ?? 1) - 1) })
      .eq('id', profileId)
  }
}
