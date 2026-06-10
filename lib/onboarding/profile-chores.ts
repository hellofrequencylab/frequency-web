import { createAdminClient } from '@/lib/supabase/admin'

// Vera's "chores" — the profile-tidy + first-content list she holds a Founder to
// (BETA-ACTIVATION §2, the matriarch bait-and-switch). Distinct from the activation
// funnel (lib/onboarding/status.ts): that's the core loop (circle/practice/log);
// this is "everything in its place" — be findable + credible, and break the seal on
// content. Four chores, all with a clean completion signal and a one-tap editor.

export type ChoreKey = 'photo' | 'bio' | 'city' | 'post'

export interface Chore {
  key: ChoreKey
  /** The matriarch's name for the task. */
  label: string
  /** One short line of why / how. */
  nudge: string
  href: string
  done: boolean
}

export interface ProfileChores {
  chores: Chore[]
  /** Incomplete chores, in order. */
  todo: Chore[]
  pct: number
  complete: boolean
  /** Whether the one-time completion reward has already been granted. */
  rewarded: boolean
}

export async function getProfileChores(profileId: string): Promise<ProfileChores> {
  const admin = createAdminClient()

  const [profileRes, postRes] = await Promise.all([
    admin.from('profiles').select('avatar_url, bio, city, meta').eq('id', profileId).maybeSingle(),
    admin.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', profileId),
  ])

  const p = profileRes.data
  const meta = (p?.meta ?? null) as { chores?: { rewarded?: boolean } } | null

  const chores: Chore[] = [
    {
      key: 'photo',
      label: 'Put a face to your name',
      nudge: 'A photo. Ten seconds. People recognize people.',
      href: '/settings/profile',
      done: !!p?.avatar_url,
    },
    {
      key: 'bio',
      label: 'One line on who you are',
      nudge: 'Not a memoir. A sentence so your people know it’s you.',
      href: '/settings/profile',
      done: !!(p?.bio && String(p.bio).trim()),
    },
    {
      key: 'city',
      label: 'Where you’re planted',
      nudge: 'Your city. It’s how the people near you actually find you.',
      href: '/settings/profile',
      done: !!(p?.city && String(p.city).trim()),
    },
    {
      key: 'post',
      label: 'Break the seal: say something',
      nudge: 'One post. A hello, a question, anything. Lurking isn’t building.',
      href: '/feed',
      done: (postRes.count ?? 0) > 0,
    },
  ]

  const todo = chores.filter((c) => !c.done)
  const doneCount = chores.length - todo.length

  return {
    chores,
    todo,
    pct: Math.round((doneCount / chores.length) * 100),
    complete: todo.length === 0,
    rewarded: !!meta?.chores?.rewarded,
  }
}
