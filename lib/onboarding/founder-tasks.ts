import { createAdminClient } from '@/lib/supabase/admin'
import { getPracticeStreak } from '@/lib/practice-streak'
import { FOUNDER_TASKS, type FounderTaskCopy, type FounderTaskKey } from '@/lib/onboarding/founder-config'

// Founder's First Week — the "go deeper" layer past activation (BETA-ACTIVATION
// §3–4, build item 1.4). Event-derived: each task is computed from the domain
// tables the engagement events write to (posts, post_reactions, friendships,
// memberships, event_rsvps, the practice streak) — the same source-of-truth
// approach as getUserStats, so it can never disagree with the gamification engine.
// No new engine: rewards ride the existing gem ledger, the badge the achievements
// catalog (claimFounderRewards in app/(main)/founder/founder-actions.ts).
//
// The task COPY (labels / nudges / links) + the reward all live in one editable
// place — lib/onboarding/founder-config.ts. This module only computes `done`.

export type { FounderTaskKey } from '@/lib/onboarding/founder-config'

export interface FounderTask extends FounderTaskCopy {
  done: boolean
}

export interface FounderTasks {
  tasks: FounderTask[]
  doneCount: number
  total: number
  pct: number
  complete: boolean
  /** Task keys already paid a first-occurrence reward (from profiles.meta.founder). */
  rewarded: FounderTaskKey[]
  /** Whether the "Founder's First Week" badge has been granted. */
  badgeGranted: boolean
}

export async function getFounderTasks(profileId: string): Promise<FounderTasks> {
  const admin = createAdminClient()

  const [posts, reactions, friends, circles, rsvps, streak, profileRow] = await Promise.all([
    admin.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', profileId),
    admin.from('post_reactions').select('id', { count: 'exact', head: true }).eq('profile_id', profileId),
    admin
      .from('friendships')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`user_a_id.eq.${profileId},user_b_id.eq.${profileId}`),
    admin.from('memberships').select('id', { count: 'exact', head: true }).eq('profile_id', profileId).eq('status', 'active'),
    admin.from('event_rsvps').select('id', { count: 'exact', head: true }).eq('profile_id', profileId).eq('status', 'going'),
    getPracticeStreak(profileId),
    admin.from('profiles').select('meta').eq('id', profileId).maybeSingle(),
  ])

  const meta = (profileRow.data?.meta ?? null) as { founder?: { rewarded?: FounderTaskKey[]; badge?: boolean } } | null

  // The source-of-truth signal proving each task done. Copy lives in the config; this
  // is the only place that knows which DB fact each key maps to.
  const doneByKey: Record<FounderTaskKey, boolean> = {
    post: (posts.count ?? 0) > 0,
    react: (reactions.count ?? 0) > 0,
    friend: (friends.count ?? 0) > 0,
    second_circle: (circles.count ?? 0) >= 2,
    rsvp: (rsvps.count ?? 0) > 0,
    streak3: streak.current >= 3,
  }

  const tasks: FounderTask[] = FOUNDER_TASKS.map((t) => ({ ...t, done: doneByKey[t.key] }))

  const doneCount = tasks.filter((t) => t.done).length

  return {
    tasks,
    doneCount,
    total: tasks.length,
    pct: Math.round((doneCount / tasks.length) * 100),
    complete: doneCount === tasks.length,
    rewarded: meta?.founder?.rewarded ?? [],
    badgeGranted: !!meta?.founder?.badge,
  }
}
