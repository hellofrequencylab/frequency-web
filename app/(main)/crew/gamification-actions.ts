'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { getStaffMember } from '@/lib/staff'
import { canAdministerAchievements } from '@/lib/moderation/scope'
import type { AchievementCategory, AchievementTier, StreakType } from '@/lib/gamification'
import type { Database } from '@/lib/database.types'

type ProfileRow = Database['public']['Tables']['profiles']['Row']
type AchievementRow = Database['public']['Tables']['achievements']['Row']

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
      achievementCount: (profile as ProfileRow | null)?.achievement_count ?? 0,
      lifetimeZaps:     (profile as ProfileRow | null)?.lifetime_zaps     ?? 0,
      currentStreak:    (profile as ProfileRow | null)?.current_streak    ?? 0,
      longestStreak:    (profile as ProfileRow | null)?.longest_streak    ?? 0,
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
      // Archived rows (Rewards Economy v2 re-seed) keep history, never display.
      .eq('is_active', true)
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
// Complete a Journey's Expression Challenge (the capstone). The member self-attests
// the share and picks where it happened: in person at a Circle (+50 Zaps) or solo
// online (+30 Gems). This is the ONLY member entry point to the Expression capstone,
// and completing it can finish the Journey (lib/quest/expression.ts owns the reward +
// the journey-finish check). profileId always comes from the session, never the
// client, so a member can only complete their OWN capstone.
// ---------------------------------------------------------------------------

export async function completeExpression(
  journeyId: string,
  mode: 'circle' | 'online',
): Promise<{ ok: boolean; found: boolean; zaps: number; gems: number; finishedJourney: boolean; rank: string | null }> {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in')

  const { completeExpressionChallenge } = await import('@/lib/quest/expression')
  const res = await completeExpressionChallenge(profileId, journeyId, { mode })

  // The capstone touches season rank, Zaps/Gems, and the Journey card across surfaces.
  revalidatePath('/crew/challenges')
  revalidatePath('/crew/leaderboard')
  revalidatePath('/crew/store')
  revalidatePath('/crew')
  revalidatePath('/people', 'layout')

  return {
    ok: res.ok,
    found: res.found,
    zaps: res.zaps,
    gems: res.gems,
    finishedJourney: !!res.journey?.completed,
    rank: res.journey?.rank ?? null,
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
    const a = row.achievement as unknown as Pick<AchievementRow,
      'id' | 'name' | 'description' | 'icon' | 'tier' | 'zaps_reward'> | null
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

// The one gate for awardAchievement + revokeAchievement (L7-4). Staff only, on either staff axis:
// platform staff (web_role admin/janitor) or a team_members role holding `community` at write.
// Throws the same 'Unauthorized' the two actions always threw on denial.
//
// 🔴 It USED to admit `community_role in (host, guide, mentor, admin, janitor)` first, and that was
// the defect: `host` is self-granted (publishing a Circle runs `ensureHostOnOwnership`), a badge is
// platform-wide with no circle to scope a host to, and the write goes through a client that
// bypasses RLS. So any member who had published a circle could grant or revoke any badge on any
// profile. The community ladder no longer opens this; `canAdministerAchievements`
// (lib/moderation/scope.ts) is the decision.
async function requireAchievementAdmin(): Promise<string> {
  const caller = await getCallerProfile()
  if (!caller) throw new Error('Not authenticated')
  // Also admit a community-domain staffer (a staff role holding the 'community' capability),
  // matching the page gate requireAdmin('host', { staff: 'community' }). Mirrors feed/report-actions.
  const staff = await getStaffMember().catch(() => null)
  if (!canAdministerAchievements({ webRole: caller.webRole, staffRole: staff?.role })) {
    throw new Error('Unauthorized')
  }
  return caller.id
}

export async function awardAchievement(profileId: string, achievementId: string) {
  // Check caller is host+
  // (That line is the pre-L7-4 rule, kept for the record; the gate is now staff-only, see
  // requireAchievementAdmin above.)
  await requireAchievementAdmin()

  const admin = createAdminClient()

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
  // Also admit a community-domain staffer, matching the page gate
  // requireAdmin('host', { staff: 'community' }). Mirrors feed/report-actions.
  // (Both arms of that sentence now live in requireAchievementAdmin; the community_role arm that
  // used to sit beside them is gone, L7-4.)
  await requireAchievementAdmin()

  const admin = createAdminClient()

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
    const current = (profile as Pick<ProfileRow, 'achievement_count'>).achievement_count ?? 1
    await admin
      .from('profiles')
      .update({ achievement_count: Math.max(0, current - 1) })
      .eq('id', profileId)
  }
}
