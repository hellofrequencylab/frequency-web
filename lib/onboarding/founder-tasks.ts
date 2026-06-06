import { createAdminClient } from '@/lib/supabase/admin'
import { getPracticeStreak } from '@/lib/practice-streak'

// Founder's First Week — the "go deeper" layer past activation (BETA-ACTIVATION
// §3–4, build item 1.4). Event-derived: each task is computed from the domain
// tables the engagement events write to (posts, post_reactions, friendships,
// memberships, event_rsvps, the practice streak) — the same source-of-truth
// approach as getUserStats, so it can never disagree with the gamification engine.
// No new engine: rewards ride the existing gem ledger, the badge the achievements
// catalog (claimFounderRewards in app/(main)/founder/founder-actions.ts).

export type FounderTaskKey = 'post' | 'react' | 'friend' | 'second_circle' | 'rsvp' | 'streak3'

export interface FounderTask {
  key: FounderTaskKey
  label: string
  nudge: string
  href: string
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

  const tasks: FounderTask[] = [
    {
      key: 'post',
      label: 'Say something',
      nudge: 'Your first post — a hello, a question, a photo from today.',
      href: '/feed',
      done: (posts.count ?? 0) > 0,
    },
    {
      key: 'react',
      label: 'React to someone',
      nudge: 'A heart or a +1 on a post. Let someone know you saw them.',
      href: '/feed',
      done: (reactions.count ?? 0) > 0,
    },
    {
      key: 'friend',
      label: 'Make a friend',
      nudge: 'Connect with one person. The network starts with a single tie.',
      href: '/people',
      done: (friends.count ?? 0) > 0,
    },
    {
      key: 'second_circle',
      label: 'Join a second circle',
      nudge: 'One circle is a foothold; two is a life. Find another room.',
      href: '/circles',
      done: (circles.count ?? 0) >= 2,
    },
    {
      key: 'rsvp',
      label: 'RSVP to something',
      nudge: 'Say you’ll be there. Showing up in person is the whole point.',
      href: '/events',
      done: (rsvps.count ?? 0) > 0,
    },
    {
      key: 'streak3',
      label: 'Build a 3-day streak',
      nudge: 'Log your practice three days running. Momentum is the reward.',
      href: '/practices',
      done: streak.current >= 3,
    },
  ]

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
