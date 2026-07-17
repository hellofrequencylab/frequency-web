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
): Promise<boolean> {
  if (!(amount > 0)) return false
  if (currency === 'zaps') {
    const r = await awardZaps(profileId, amount, { actionType: action, metadata })
    return r.awarded
  }
  const r = await awardGems(profileId, action, amount, metadata)
  return r.awarded
}

// Pay a completed challenge's purse EXACTLY ONCE, claim-then-pay on reward_grants
// (rule_key `challenge:{challengeId}:{profileId}`, the same idempotency the rest of the
// economy uses — lib/journeys/grants.ts, lib/quest/complete.ts). advance_challenge_progress
// already fires `just_completed` once per (member, challenge) under its advisory lock, so this
// is the second guarantee that a redelivered/concurrent completion can never double-pay the
// purse. The UNIQUE (rule_key, profile_id) insert is the lock; if the currency award then
// fails, release the claim so a later retry can re-pay (else: claimed-but-unpaid forever).
async function grantChallengeReward(
  admin: AdminClient,
  challengeId: string,
  profileId: string,
  currency: EngagementCurrency,
  amount: number,
): Promise<boolean> {
  if (!(amount > 0)) return false
  const ruleKey = `challenge:${challengeId}:${profileId}`
  const { error: claimErr } = await admin
    .from('reward_grants')
    .insert({ rule_key: ruleKey, profile_id: profileId, reward_kind: currency, amount, detail: `challenge:${challengeId}` })
  if (claimErr) return false // already paid / lost the race
  const paid = await grantReward(profileId, currency, amount, 'challenge_complete', { challenge: challengeId })
  if (!paid) {
    await admin.from('reward_grants').delete().eq('rule_key', ruleKey).eq('profile_id', profileId)
    return false
  }
  return true
}

// Atomically advance one member's progress on one challenge (advance_challenge_progress,
// migration 20261002000000). The prior read-compute-write in advanceChallenges was a race:
// concurrent events lost increments and double-completed => double-paid the purse. The RPC
// serializes per (member, challenge) and reports whether THIS call finished it. Not in the
// generated types yet, so call it through the untyped rpc surface (repo convention).
async function advanceChallengeProgress(
  admin: AdminClient,
  profileId: string,
  challengeId: string,
  target: number,
): Promise<{ current: number; completed: boolean; just_completed: boolean } | null> {
  const rpc = admin.rpc as unknown as (
    name: 'advance_challenge_progress',
    args: { _profile: string; _challenge: string; _target: number },
  ) => Promise<{ data: { current: number; completed: boolean; just_completed: boolean } | null; error: { message: string } | null }>
  const { data, error } = await rpc('advance_challenge_progress', {
    _profile: profileId,
    _challenge: challengeId,
    _target: target,
  })
  if (error) {
    console.error('[gamification] advance_challenge_progress failed:', error.message)
    return null
  }
  return data
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
  // A governed playbook finished for this member (Resonance Engine Phase 5 · ADR-386).
  // Fires retroactive milestones for the advocate state (e.g. connector / facilitator).
  | { type: 'playbook_complete'; profileId: string; playbookId?: string }
  // A real connection landed for this member — a captured event guest RSVP'd / attended /
  // joined (ADR-154 / ADR-777). Drives the Connector achievement (10 / 25 / 100).
  | { type: 'connector_connection'; profileId: string }

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
    // Note: the v2 Zap-Surprise-on-real-world-acts hook was retired with the Surprises
    // subsystem (ADR-305). The v3 variable layer (Spark) covers only the practice log by
    // design, so there is no variable bonus on the gamification chokepoint.
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
  const windowDays = STREAK_CONFIG[streakType]?.window_days ?? 9

  // Atomic tick: record_streak_tick (migration 20261002000000) serializes per (member, streak),
  // dedups to one tick per home-zone week, and extends-or-resets by the grace window in a single
  // statement — closing the old read-compute-write race (lost increments, double streak_update
  // events, insert-race errors). Not in the generated types yet, so call it untyped (repo convention).
  const rpc = admin.rpc as unknown as (
    name: 'record_streak_tick',
    args: { _profile: string; _streak_type: string; _window_days: number },
  ) => Promise<{ data: { current: number; longest: number; ticked: boolean } | null; error: { message: string } | null }>

  const { data, error } = await rpc('record_streak_tick', {
    _profile: profileId,
    _streak_type: streakType,
    _window_days: windowDays,
  })

  if (error || !data) {
    console.error('[gamification] record_streak_tick failed:', error?.message)
    return { current: 0, longest: 0 }
  }

  // Fire the streak milestone check only on a real tick — mirrors the old same-week no-op,
  // which returned before emitting the streak_update event.
  if (data.ticked) {
    await processGamificationEvent({
      type: 'streak_update',
      profileId,
      streakType,
      count: data.current,
    })
  }

  return { current: data.current, longest: data.longest }
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
    // Playbook completions (ADR-386): the advocate-state recognition path.
    case 'playbook_complete': return event.type === 'playbook_complete'
    // Connector (ADR-154): the event-invite real-connection milestone.
    case 'connections':    return event.type === 'connector_connection'
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
  /** Governed playbooks finished for this member (playbook_runs status 'done', ADR-386). */
  playbooksCompleted: number
  /** Real connections captured (event_guests RSVP'd going/maybe) — the Connector count. */
  connectionCount: number
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

  // Governed playbooks finished FOR this member (ADR-386). The playbook_runs table is not in
  // the generated DB types yet, so reach it untyped (ADR-246), FAIL-SAFE to 0 on any error so
  // a missing table (pre-migration) never breaks achievement evaluation.
  let playbooksCompleted = 0
  try {
    const runs = admin as unknown as {
      from: (t: string) => {
        select: (c: string, o: { count: 'exact'; head: true }) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => Promise<{ count: number | null }>
          }
        }
      }
    }
    const { count } = await runs
      .from('playbook_runs')
      .select('id', { count: 'exact', head: true })
      .eq('subject_id', profileId)
      .eq('status', 'done')
    playbooksCompleted = count ?? 0
  } catch {
    playbooksCompleted = 0
  }

  // Real connections (ADR-154 / ADR-777): captured event guests who at least RSVP'd
  // (going/maybe). A bare capture (declined / no stated intent) never counts. event_guests
  // is not in the generated types yet (ADR-246), so count it untyped, FAIL-SAFE to 0.
  let connectionCount = 0
  try {
    const eg = admin as unknown as {
      from: (t: string) => {
        select: (c: string, o: { count: 'exact'; head: true }) => {
          eq: (col: string, val: string) => {
            in: (col: string, vals: string[]) => Promise<{ count: number | null }>
          }
        }
      }
    }
    const { count } = await eg
      .from('event_guests')
      .select('id', { count: 'exact', head: true })
      .eq('inviter_profile_id', profileId)
      .in('rsvp_status', ['going', 'maybe'])
    connectionCount = count ?? 0
  } catch {
    connectionCount = 0
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
    playbooksCompleted,
    connectionCount,
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
    case 'playbook_complete':
      return stats.playbooksCompleted >= criteria.count
    case 'connections':
      return stats.connectionCount >= criteria.count
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

    // Atomic advance: serializes per (member, challenge), increments once, and reports whether
    // THIS call finished it. Closes the old lost-increment + double-completion race.
    const res = await advanceChallengeProgress(admin, event.profileId, challenge.id, challenge.target)
    if (!res) continue // RPC failed — leave progress untouched rather than tear it with app writes

    if (res.just_completed) {
      // A challenge pays in the currency of the act it tracks: an in-person
      // challenge ("Attend 8 events") pays zaps and drives season rank; an online
      // one ("Make 5 posts") pays gems (ADR-139). Paid once via claim-then-pay.
      const ctype = (criteria.type as string) ?? ''
      const streakType = ctype === 'streak' ? (criteria.streak_type as string) : undefined
      const currency = currencyForCriteria(ctype, { streakType })
      await grantChallengeReward(admin, challenge.id, event.profileId, currency, challenge.zaps_reward ?? 0)
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
    await grantChallengeReward(admin, completionist.id, profileId, 'zaps', completionist.zaps_reward ?? 0).catch(() => {})
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
// The weekly attendance/posting/hosting streaks live only in the `streaks` table
// and surface on /crew/streaks — they no longer drive the headline. The once-per-week
// dedup + grace-window logic now lives atomically in record_streak_tick (migration
// 20261002000000), so the old JS isSameWeek/window math here was retired with it.
