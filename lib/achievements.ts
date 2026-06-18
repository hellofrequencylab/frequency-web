// Achievement evaluation engine.
// Called server-side after significant user actions to check and award
// any newly-qualified achievements + advance challenge progress.

import { createAdminClient } from '@/lib/supabase/admin'
import type { AchievementCriteria, StreakType } from '@/lib/gamification'
import { STREAK_CONFIG } from '@/lib/gamification'
import { awardGems } from '@/lib/gems'
import { awardZaps } from '@/lib/zaps'
import { currencyForCriteria, type EngagementCurrency } from '@/lib/engagement/currency'
import type { Database } from '@/lib/database.types'

type AdminClient = ReturnType<typeof createAdminClient>
type ProfileRow  = Database['public']['Tables']['profiles']['Row']

// Pay a meta-layer reward (achievement / challenge / quest) in the currency that
// fits the milestone (ADR-139): real-life acts pay zaps, online acts pay gems.
// Both currencies are ledgered (zap_transactions / gem_transactions), so the
// grant surfaces in the Vault "how you earned" log. The gem path reuses the
// configured action row (overriding its amount); the zap path labels the ledger.
async function grantReward(
  profileId: string,
  currency: EngagementCurrency,
  amount: number,
  action: 'achievement' | 'challenge_complete' | 'quest_complete',
  metadata: Record<string, unknown>,
): Promise<void> {
  if (!(amount > 0)) return
  if (currency === 'zaps') {
    await awardZaps(profileId, amount, { actionType: action, metadata })
  } else {
    await awardGems(profileId, action, amount, metadata)
  }
}

// ---------------------------------------------------------------------------
// Public API — call after each user action
// ---------------------------------------------------------------------------

export type GamificationEvent =
  | { type: 'task_complete';  profileId: string }
  | { type: 'event_attend';   profileId: string }
  | { type: 'event_host';     profileId: string }
  | { type: 'post_create';    profileId: string }
  | { type: 'circle_join';    profileId: string }
  | { type: 'practice_log';   profileId: string }
  | { type: 'referral';       profileId: string }
  | { type: 'role_change';    profileId: string; role: string }
  | { type: 'streak_update';  profileId: string; streakType: StreakType; count: number }
  | { type: 'rank_change';    profileId: string; rank: string }
  | { type: 'qr_scan';        profileId: string; qrCodeId: string }

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
    // Zap Surprise (ADR-210): a variable, unannounced bonus on appropriate real-world
    // acts (attend / host / refer / task / scan). No-op for other event types and at
    // most once per day; isolated so a surprise can never affect the achievement flow.
    try {
      const { fireZapSurpriseForAct } = await import('@/lib/surprises')
      await fireZapSurpriseForAct(event.profileId, event.type)
    } catch {
      // never let a surprise break gamification processing
    }
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
        // Pay the reward ONCE, in the currency that matches the achievement's
        // nature. In-person achievements (attend/host/lead, attendance streaks)
        // pay zaps; online ones (posts, joins, welcomes) pay gems. The DB trigger
        // no longer pays zaps here — this is the single award (ADR-139).
        if (achievement.zaps_reward > 0) {
          const streakType = criteria.type === 'streak' ? criteria.streak_type : undefined
          const currency = currencyForCriteria(criteria.type, { streakType })
          grantReward(event.profileId, currency, achievement.zaps_reward, 'achievement', {
            achievement: achievement.slug,
          }).catch(() => {})
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
    case 'practice_streak': return event.type === 'practice_log'
    case 'season_zaps':    return event.type === 'task_complete'
    case 'rank_reached':   return event.type === 'rank_change' || event.type === 'task_complete'
    case 'task_complete':  return event.type === 'task_complete'
    // Amplitude moves on every zap-paying act — check it wherever zaps flow.
    case 'amplitude':
      return event.type === 'practice_log' || event.type === 'task_complete' ||
             event.type === 'event_attend' || event.type === 'event_host' ||
             event.type === 'qr_scan' || event.type === 'referral'
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
  /** The DAILY practice streak (profiles.current_streak — lib/practice-streak.ts). */
  practiceStreak: number
  /** Lifetime XP (profiles.amplitude — Rewards Economy v2). */
  amplitude: number
}

async function getUserStats(admin: AdminClient, profileId: string): Promise<UserStats> {
  const [profile, memberships, rsvps, hostedEvents, posts, topPost, completions, streaks, inviteLinks] =
    await Promise.all([
      admin.from('profiles')
        .select('current_season_zaps, current_season_rank, community_role, current_streak, amplitude')
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

  const p = profile.data as (Pick<ProfileRow,
    'current_season_zaps' | 'current_season_rank' | 'community_role' | 'current_streak'> &
    { amplitude?: number | null }) | null
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
    practiceStreak: p?.current_streak ?? 0,
    amplitude: Number(p?.amplitude ?? 0),
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
    case 'practice_streak':
      return stats.practiceStreak >= criteria.count
    case 'amplitude':
      return stats.amplitude >= criteria.count
    default:
      return false
  }
}

// ---------------------------------------------------------------------------
// Season challenge advancement
// ---------------------------------------------------------------------------

async function advanceChallenges(admin: AdminClient, event: GamificationEvent) {
  // Archived challenge rows (is_active = false) keep history but never advance.
  const { data: challenges } = await admin
    .from('season_challenges')
    .select('id, criteria, target, valid_from, valid_until, zaps_reward')
    .eq('is_active', true)

  if (!challenges?.length) return

  for (const challenge of challenges) {
    const criteria = challenge.criteria as Record<string, unknown>

    // QR campaigns: a scan counts only when the scanned code is in this
    // challenge's set (challenge_qr_codes). The event is emitted once per
    // (code, member), so progress counts DISTINCT codes — "scan N of these".
    if ((criteria.type as string) === 'qr_scan') {
      if (event.type !== 'qr_scan') continue
      // Respect the campaign's run window (null bounds = always on).
      const now = Date.now()
      if (challenge.valid_from && new Date(challenge.valid_from).getTime() > now) continue
      if (challenge.valid_until && new Date(challenge.valid_until).getTime() < now) continue
      const { count } = await admin
        .from('challenge_qr_codes')
        .select('*', { count: 'exact', head: true })
        .eq('challenge_id', challenge.id)
        .eq('qr_code_id', event.qrCodeId)
      if (!count) continue
    } else if (!isChallengeRelevant(criteria, event)) {
      continue
    }

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
      // A challenge pays in the currency of the act it tracks: an in-person
      // challenge ("Attend 8 events") pays zaps and drives season rank; an online
      // one ("Make 5 posts") pays gems (ADR-139).
      const ctype = (criteria.type as string) ?? ''
      const streakType = ctype === 'streak' ? (criteria.streak_type as string) : undefined
      const currency = currencyForCriteria(ctype, { streakType })
      await grantReward(event.profileId, currency, challenge.zaps_reward ?? 0, 'challenge_complete', {
        challenge: challenge.id,
      })
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
    // The Completionist never advances per-event: checkAllChallengesComplete
    // completes it (and pays it) when every OTHER active challenge is done.
    case 'all_challenges': return false
    default:               return false
  }
}

async function checkAllChallengesComplete(admin: AdminClient, profileId: string) {
  const { data: allChallenges } = await admin
    .from('season_challenges')
    .select('id, slug, target, zaps_reward')
    .eq('is_active', true)

  if (!allChallenges?.length) return
  const completionist = allChallenges.find(c => c.slug === 'complete-all-challenges')
  const others = allChallenges.filter(c => c.slug !== 'complete-all-challenges')
  if (others.length === 0) return

  const { data: completed } = await admin
    .from('challenge_progress')
    .select('challenge_id')
    .eq('profile_id', profileId)
    .not('completed_at', 'is', null)

  const completedIds = new Set((completed ?? []).map(c => c.challenge_id))
  const allDone = others.every(c => completedIds.has(c.id))
  if (!allDone) return

  // Complete + pay the Completionist itself (250⚡ ON TOP of the 1,000⚡ purse),
  // and grant the "Every Frequency" prismatic border (S1-exclusive cosmetic).
  if (completionist && !completedIds.has(completionist.id)) {
    const now = new Date().toISOString()
    const { data: progress } = await admin
      .from('challenge_progress')
      .select('id, completed_at')
      .eq('profile_id', profileId)
      .eq('challenge_id', completionist.id)
      .maybeSingle()
    if (progress?.completed_at) return
    if (progress) {
      await admin
        .from('challenge_progress')
        .update({ current: completionist.target, completed_at: now })
        .eq('id', progress.id)
    } else {
      await admin.from('challenge_progress').insert({
        profile_id: profileId,
        challenge_id: completionist.id,
        current: completionist.target,
        completed_at: now,
      })
    }
    await grantReward(profileId, 'zaps', completionist.zaps_reward ?? 0, 'challenge_complete', {
      challenge: completionist.id,
    }).catch(() => {})
    try {
      const { grantStoreItem } = await import('@/lib/awards/cosmetics')
      await grantStoreItem(profileId, 'every-frequency-border')
    } catch {
      // a cosmetic grant never breaks the challenge flow
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Note: the headline streak columns (profiles.current_streak / longest_streak)
// now track the DAILY practice streak, owned by lib/practice-streak.ts (ADR-145).
// The weekly attendance/posting/hosting streaks below live only in the `streaks`
// table and surface on /crew/streaks — they no longer drive the headline.

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
