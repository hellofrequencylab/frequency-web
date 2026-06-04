// Achievement evaluation engine.
// Called server-side after significant user actions to check and award
// any newly-qualified achievements + advance challenge progress.

import { createAdminClient } from '@/lib/supabase/admin'
import type { AchievementCriteria, StreakType } from '@/lib/gamification'
import { STREAK_CONFIG } from '@/lib/gamification'
import { awardGems } from '@/lib/gems'
import type { Database } from '@/lib/database.types'

type AdminClient = ReturnType<typeof createAdminClient>
type ProfileRow  = Database['public']['Tables']['profiles']['Row']

// ---------------------------------------------------------------------------
// Public API — call after each user action
// ---------------------------------------------------------------------------

export type GamificationEvent =
  | { type: 'task_complete';  profileId: string }
  | { type: 'event_attend';   profileId: string }
  | { type: 'event_host';     profileId: string }
  | { type: 'post_create';    profileId: string }
  | { type: 'circle_join';    profileId: string }
  | { type: 'referral';       profileId: string }
  | { type: 'role_change';    profileId: string; role: string }
  | { type: 'streak_update';  profileId: string; streakType: StreakType; count: number }
  | { type: 'rank_change';    profileId: string; rank: string }

export interface NewAchievement {
  id: string
  name: string
  description: string
  icon: string
  tier: string
  zapsReward: number
}

export async function processGamificationEvent(
  event: GamificationEvent,
): Promise<NewAchievement[]> {
  const admin = createAdminClient()

  try {
    const newAchievements = await evaluateAchievements(admin, event)
    await advanceChallenges(admin, event)
    await advanceQuests(admin, event)
    return newAchievements
  } catch (err) {
    console.error('[gamification] event processing failed:', err)
    return []
  }
}

// ---------------------------------------------------------------------------
// Record a streak tick — call when a streakable action happens
// ---------------------------------------------------------------------------

export async function recordStreakActivity(
  profileId: string,
  streakType: StreakType,
): Promise<{ current: number; longest: number }> {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: existing } = await admin
    .from('streaks')
    .select('id, current_count, longest_count, last_activity_at')
    .eq('profile_id', profileId)
    .eq('streak_type', streakType)
    .maybeSingle()

  if (!existing) {
    const { data } = await admin
      .from('streaks')
      .insert({
        profile_id: profileId,
        streak_type: streakType,
        current_count: 1,
        longest_count: 1,
        last_activity_at: now,
      })
      .select('current_count, longest_count')
      .single()

    await updateProfileStreak(admin, profileId)
    await processGamificationEvent({
      type: 'streak_update',
      profileId,
      streakType,
      count: 1,
    })

    return { current: data?.current_count ?? 1, longest: data?.longest_count ?? 1 }
  }

  const lastActivity = existing.last_activity_at
    ? new Date(existing.last_activity_at)
    : null
  const nowDate = new Date()

  // Already recorded this week — no-op
  if (lastActivity && isSameWeek(lastActivity, nowDate)) {
    return { current: existing.current_count, longest: existing.longest_count }
  }

  // Check if streak is still alive (within window per type)
  const windowDays = STREAK_CONFIG[streakType]?.window_days ?? 9
  const daysSinceLast = lastActivity
    ? (nowDate.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
    : Infinity

  let newCurrent: number
  if (daysSinceLast <= windowDays) {
    newCurrent = existing.current_count + 1
  } else {
    newCurrent = 1
  }

  const newLongest = Math.max(existing.longest_count, newCurrent)

  await admin
    .from('streaks')
    .update({
      current_count: newCurrent,
      longest_count: newLongest,
      last_activity_at: now,
      updated_at: now,
    })
    .eq('id', existing.id)

  await updateProfileStreak(admin, profileId)
  await processGamificationEvent({
    type: 'streak_update',
    profileId,
    streakType,
    count: newCurrent,
  })

  return { current: newCurrent, longest: newLongest }
}

// ---------------------------------------------------------------------------
// Achievement evaluation
// ---------------------------------------------------------------------------

async function evaluateAchievements(admin: AdminClient, event: GamificationEvent): Promise<NewAchievement[]> {
  const { data: allAchievements } = await admin
    .from('achievements')
    .select('id, slug, name, description, icon, tier, zaps_reward, criteria')

  if (!allAchievements?.length) return []

  const { data: userAchievements } = await admin
    .from('user_achievements')
    .select('achievement_id')
    .eq('profile_id', event.profileId)

  const earnedIds = new Set((userAchievements ?? []).map(ua => ua.achievement_id))
  const stats = await getUserStats(admin, event.profileId)
  const newlyUnlocked: NewAchievement[] = []

  for (const achievement of allAchievements) {
    if (earnedIds.has(achievement.id)) continue

    const criteria = achievement.criteria as AchievementCriteria
    if (criteria.type === 'manual') continue

    if (isRelevantEvent(criteria, event) && isCriteriaMet(criteria, stats, event)) {
      const { error } = await admin.from('user_achievements').insert({
        profile_id: event.profileId,
        achievement_id: achievement.id,
      })
      if (!error) {
        newlyUnlocked.push({
          id: achievement.id,
          name: achievement.name,
          description: achievement.description,
          icon: achievement.icon,
          tier: achievement.tier,
          zapsReward: achievement.zaps_reward,
        })
        if (achievement.zaps_reward > 0) {
          awardGems(event.profileId, 'achievement', achievement.zaps_reward, { achievement: achievement.slug }).catch(() => {})
        }
      }
    }
  }

  return newlyUnlocked
}

function isRelevantEvent(criteria: AchievementCriteria, event: GamificationEvent): boolean {
  switch (criteria.type) {
    case 'circle_join':    return event.type === 'circle_join'
    case 'referral':       return event.type === 'referral'
    case 'welcome_member': return event.type === 'post_create'
    case 'event_attend':   return event.type === 'event_attend'
    case 'event_host':     return event.type === 'event_host'
    case 'post_create':    return event.type === 'post_create'
    case 'post_replies':   return event.type === 'post_create'
    case 'role_earned':    return event.type === 'role_change'
    case 'streak':         return event.type === 'streak_update'
    case 'season_zaps':    return event.type === 'task_complete'
    case 'rank_reached':   return event.type === 'rank_change' || event.type === 'task_complete'
    case 'task_complete':  return event.type === 'task_complete'
    default:               return false
  }
}

interface UserStats {
  circleCount: number
  eventAttendCount: number
  eventHostCount: number
  postCount: number
  maxPostReplies: number
  referralCount: number
  taskCompleteCount: number
  seasonZaps: number
  currentRank: string
  communityRole: string
  streaks: Record<string, number>
}

async function getUserStats(admin: AdminClient, profileId: string): Promise<UserStats> {
  const [profile, memberships, rsvps, hostedEvents, posts, topPost, completions, streaks, inviteLinks] =
    await Promise.all([
      admin.from('profiles')
        .select('current_season_zaps, current_season_rank, community_role')
        .eq('id', profileId)
        .maybeSingle(),
      admin.from('memberships')
        .select('id')
        .eq('profile_id', profileId)
        .eq('status', 'active'),
      admin.from('event_rsvps')
        .select('id')
        .eq('profile_id', profileId)
        .eq('status', 'going'),
      admin.from('events')
        .select('id')
        .eq('host_id', profileId),
      admin.from('posts')
        .select('id')
        .eq('author_id', profileId),
      admin.from('posts')
        .select('reply_count')
        .eq('author_id', profileId)
        .order('reply_count', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.from('crew_completions')
        .select('id')
        .eq('profile_id', profileId),
      admin.from('streaks')
        .select('streak_type, current_count')
        .eq('profile_id', profileId),
      admin.from('invite_links')
        .select('used_count')
        .eq('created_by', profileId),
    ])

  const streakMap: Record<string, number> = {}
  for (const s of streaks.data ?? []) {
    streakMap[s.streak_type] = s.current_count
  }

  type InviteLinkRow = { used_count: number | null }
  const totalReferrals = (inviteLinks.data ?? []).reduce(
    (sum, link) => sum + ((link as InviteLinkRow).used_count ?? 0), 0
  )

  const p = profile.data as Pick<ProfileRow,
    'current_season_zaps' | 'current_season_rank' | 'community_role'> | null
  const topPostRow = topPost.data as { reply_count: number | null } | null

  return {
    circleCount: memberships.data?.length ?? 0,
    eventAttendCount: rsvps.data?.length ?? 0,
    eventHostCount: hostedEvents.data?.length ?? 0,
    postCount: posts.data?.length ?? 0,
    maxPostReplies: topPostRow?.reply_count ?? 0,
    referralCount: totalReferrals,
    taskCompleteCount: completions.data?.length ?? 0,
    seasonZaps: p?.current_season_zaps ?? 0,
    currentRank: p?.current_season_rank ?? 'ghost',
    communityRole: p?.community_role ?? 'member',
    streaks: streakMap,
  }
}

function isCriteriaMet(
  criteria: AchievementCriteria,
  stats: UserStats,
  event: GamificationEvent,
): boolean {
  switch (criteria.type) {
    case 'circle_join':
      return stats.circleCount >= criteria.count
    case 'welcome_member':
      return false
    case 'event_attend':
      return stats.eventAttendCount >= criteria.count
    case 'event_host':
      return stats.eventHostCount >= criteria.count
    case 'post_create':
      return stats.postCount >= criteria.count
    case 'post_replies':
      return stats.maxPostReplies >= criteria.count
    case 'referral':
      return stats.referralCount >= criteria.count
    case 'task_complete':
      return stats.taskCompleteCount >= criteria.count
    case 'season_zaps':
      return stats.seasonZaps >= criteria.count
    case 'rank_reached':
      return stats.currentRank === criteria.rank
    case 'role_earned':
      if (event.type === 'role_change') {
        return event.role === criteria.role
      }
      return stats.communityRole === criteria.role
    case 'streak':
      if (event.type === 'streak_update') {
        return event.streakType === criteria.streak_type && event.count >= criteria.count
      }
      return (stats.streaks[criteria.streak_type] ?? 0) >= criteria.count
    default:
      return false
  }
}

// ---------------------------------------------------------------------------
// Season challenge advancement
// ---------------------------------------------------------------------------

async function advanceChallenges(admin: AdminClient, event: GamificationEvent) {
  const { data: challenges } = await admin
    .from('season_challenges')
    .select('id, criteria, target')

  if (!challenges?.length) return

  for (const challenge of challenges) {
    const criteria = challenge.criteria as Record<string, unknown>
    if (!isChallengeRelevant(criteria, event)) continue

    const { data: progress } = await admin
      .from('challenge_progress')
      .select('id, current, completed_at')
      .eq('profile_id', event.profileId)
      .eq('challenge_id', challenge.id)
      .maybeSingle()

    if (progress?.completed_at) continue

    const newCurrent = (progress?.current ?? 0) + 1
    const completed = newCurrent >= challenge.target

    if (progress) {
      await admin
        .from('challenge_progress')
        .update({
          current: newCurrent,
          completed_at: completed ? new Date().toISOString() : null,
        })
        .eq('id', progress.id)
    } else {
      await admin
        .from('challenge_progress')
        .insert({
          profile_id: event.profileId,
          challenge_id: challenge.id,
          current: newCurrent,
          completed_at: completed ? new Date().toISOString() : null,
        })
    }

    if (completed) {
      await awardChallengeZaps(admin, event.profileId, challenge.id)
      awardGems(event.profileId, 'challenge_complete', 10, { challenge: challenge.id }).catch(() => {})
      await checkAllChallengesComplete(admin, event.profileId)
    }
  }
}

function isChallengeRelevant(
  criteria: Record<string, unknown>,
  event: GamificationEvent,
): boolean {
  const cType = criteria.type as string
  switch (cType) {
    case 'event_attend':   return event.type === 'event_attend'
    case 'event_host':     return event.type === 'event_host'
    case 'post_create':    return event.type === 'post_create'
    case 'task_complete':  return event.type === 'task_complete'
    case 'referral':       return event.type === 'referral'
    case 'season_zaps':    return event.type === 'task_complete'
    case 'streak':
      if (event.type !== 'streak_update') return false
      return criteria.streak_type === event.streakType
    case 'rank_reached':   return event.type === 'rank_change' || event.type === 'task_complete'
    case 'all_challenges': return true
    default:               return false
  }
}

async function awardChallengeZaps(admin: AdminClient, profileId: string, challengeId: string) {
  const { data: challenge } = await admin
    .from('season_challenges')
    .select('zaps_reward')
    .eq('id', challengeId)
    .maybeSingle()

  if (!challenge?.zaps_reward) return

  const { data: profile } = await admin
    .from('profiles')
    .select('current_season_zaps, lifetime_zaps')
    .eq('id', profileId)
    .maybeSingle()

  if (profile) {
    const p = profile as Pick<ProfileRow, 'current_season_zaps' | 'lifetime_zaps'>
    await admin
      .from('profiles')
      .update({
        current_season_zaps: (p.current_season_zaps ?? 0) + challenge.zaps_reward,
        lifetime_zaps: (p.lifetime_zaps ?? 0) + challenge.zaps_reward,
      })
      .eq('id', profileId)
  }
}

async function checkAllChallengesComplete(admin: AdminClient, profileId: string) {
  const { data: allChallenges } = await admin
    .from('season_challenges')
    .select('id')
    .neq('slug', 'complete-all-challenges')

  if (!allChallenges?.length) return

  const { data: completed } = await admin
    .from('challenge_progress')
    .select('challenge_id')
    .eq('profile_id', profileId)
    .not('completed_at', 'is', null)

  const completedIds = new Set((completed ?? []).map(c => c.challenge_id))
  const allDone = allChallenges.every(c => completedIds.has(c.id))

  if (allDone) {
    await admin
      .from('profiles')
      .update({ season_challenges_complete: true })
      .eq('id', profileId)
  }
}

// ---------------------------------------------------------------------------
// Quest chain advancement
// ---------------------------------------------------------------------------

async function advanceQuests(admin: AdminClient, event: GamificationEvent) {
  const { data: chains } = await admin
    .from('journey_chains')
    .select('id')

  if (!chains?.length) return

  for (const chain of chains) {
    const { data: steps } = await admin
      .from('journey_steps')
      .select('id, step_order, criteria, target, zaps_reward')
      .eq('chain_id', chain.id)
      .order('step_order')

    if (!steps?.length) continue

    const { data: progress } = await admin
      .from('journey_progress')
      .select('id, current_step, step_progress, completed_at')
      .eq('profile_id', event.profileId)
      .eq('chain_id', chain.id)
      .maybeSingle()

    if (progress?.completed_at) continue

    const currentStepOrder = progress?.current_step ?? 1
    const currentStep = steps.find(s => s.step_order === currentStepOrder)
    if (!currentStep) continue

    const criteria = currentStep.criteria as Record<string, unknown>
    if (!isArcStepRelevant(criteria, event)) continue

    const newProgress = (progress?.step_progress ?? 0) + 1

    if (newProgress >= currentStep.target) {
      // Step complete — advance to next or finish chain
      const nextStep = steps.find(s => s.step_order === currentStepOrder + 1)

      if (nextStep) {
        // Advance to next step
        if (progress) {
          await admin
            .from('journey_progress')
            .update({ current_step: nextStep.step_order, step_progress: 0 })
            .eq('id', progress.id)
        } else {
          await admin
            .from('journey_progress')
            .insert({
              profile_id: event.profileId,
              chain_id: chain.id,
              current_step: nextStep.step_order,
              step_progress: 0,
            })
        }
      } else {
        // Chain complete
        const now = new Date().toISOString()
        if (progress) {
          await admin
            .from('journey_progress')
            .update({ step_progress: newProgress, completed_at: now })
            .eq('id', progress.id)
        } else {
          await admin
            .from('journey_progress')
            .insert({
              profile_id: event.profileId,
              chain_id: chain.id,
              current_step: currentStepOrder,
              step_progress: newProgress,
              completed_at: now,
            })
        }

        // Award chain completion zaps
        const { data: chainData } = await admin
          .from('journey_chains')
          .select('zaps_reward')
          .eq('id', chain.id)
          .maybeSingle()

        if (chainData?.zaps_reward) {
          const { data: profile } = await admin
            .from('profiles')
            .select('current_season_zaps, lifetime_zaps')
            .eq('id', event.profileId)
            .maybeSingle()

          if (profile) {
            const p = profile as Pick<ProfileRow, 'current_season_zaps' | 'lifetime_zaps'>
            await admin
              .from('profiles')
              .update({
                current_season_zaps: (p.current_season_zaps ?? 0) + chainData.zaps_reward,
                lifetime_zaps: (p.lifetime_zaps ?? 0) + chainData.zaps_reward,
              })
              .eq('id', event.profileId)
          }
        }
      }

      // Award step zaps
      if (currentStep.zaps_reward > 0) {
        const { data: profile } = await admin
          .from('profiles')
          .select('current_season_zaps, lifetime_zaps')
          .eq('id', event.profileId)
          .maybeSingle()

        if (profile) {
          const p = profile as Pick<ProfileRow, 'current_season_zaps' | 'lifetime_zaps'>
          await admin
            .from('profiles')
            .update({
              current_season_zaps: (p.current_season_zaps ?? 0) + currentStep.zaps_reward,
              lifetime_zaps: (p.lifetime_zaps ?? 0) + currentStep.zaps_reward,
            })
            .eq('id', event.profileId)
        }
      }
    } else {
      // Increment progress
      if (progress) {
        await admin
          .from('journey_progress')
          .update({ step_progress: newProgress })
          .eq('id', progress.id)
      } else {
        await admin
          .from('journey_progress')
          .insert({
            profile_id: event.profileId,
            chain_id: chain.id,
            current_step: currentStepOrder,
            step_progress: newProgress,
          })
      }
    }
  }
}

function isArcStepRelevant(criteria: Record<string, unknown>, event: GamificationEvent): boolean {
  const cType = criteria.type as string
  switch (cType) {
    case 'event_attend':  return event.type === 'event_attend'
    case 'event_host':    return event.type === 'event_host'
    case 'post_create':   return event.type === 'post_create'
    case 'task_complete': return event.type === 'task_complete'
    case 'referral':      return event.type === 'referral'
    case 'post_replies':  return event.type === 'post_create'
    default:              return false
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function updateProfileStreak(admin: AdminClient, profileId: string) {
  const { data: streaks } = await admin
    .from('streaks')
    .select('current_count, longest_count')
    .eq('profile_id', profileId)

  if (!streaks?.length) return

  const maxCurrent = Math.max(...streaks.map(s => s.current_count))
  const maxLongest = Math.max(...streaks.map(s => s.longest_count))

  await admin
    .from('profiles')
    .update({
      current_streak: maxCurrent,
      longest_streak: maxLongest,
    })
    .eq('id', profileId)
}

function isSameWeek(a: Date, b: Date): boolean {
  const startOfWeek = (d: Date) => {
    const date = new Date(d)
    const day = date.getDay()
    const diff = date.getDate() - day + (day === 0 ? -6 : 1)
    date.setDate(diff)
    date.setHours(0, 0, 0, 0)
    return date.getTime()
  }
  return startOfWeek(a) === startOfWeek(b)
}
