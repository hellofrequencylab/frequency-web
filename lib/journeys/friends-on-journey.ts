import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// "On this Journey" (design_handoff/frequency/templates/members/Journey.html, the side panel): the
// viewer's FRIENDS who are enrolled in the same Journey. Accepted friendships only, never strangers:
// a friend already sees what the other is practising on their profile, so naming them here tells the
// viewer nothing a friend could not already read. Blocks in either direction drop the row. Fail-safe:
// any read error is an empty list and the panel falls back to the plain count.

export interface JourneyFriend {
  id: string
  name: string
  handle: string | null
  avatarUrl: string | null
  /** Finished the whole Journey (journey_enrollments.completed_at set). */
  finished: boolean
}

export async function listFriendsOnJourney(viewerId: string, planId: string, limit = 6): Promise<JourneyFriend[]> {
  try {
    const admin = createAdminClient()
    const [{ data: pairs }, { data: blocks }] = await Promise.all([
      admin
        .from('friendships')
        .select('user_a_id, user_b_id')
        .eq('status', 'accepted')
        .or(`user_a_id.eq.${viewerId},user_b_id.eq.${viewerId}`),
      admin
        .from('blocked_users')
        .select('blocker_id, blocked_id')
        .or(`blocker_id.eq.${viewerId},blocked_id.eq.${viewerId}`),
    ])
    const blocked = new Set<string>()
    for (const b of blocks ?? []) blocked.add(b.blocker_id === viewerId ? b.blocked_id : b.blocker_id)
    const friendIds = (pairs ?? [])
      .map((p) => (p.user_a_id === viewerId ? p.user_b_id : p.user_a_id))
      .filter((id) => !blocked.has(id))
    if (friendIds.length === 0) return []

    const { data: rows } = await admin
      .from('journey_enrollments')
      .select('profile_id, completed_at')
      .eq('plan_id', planId)
      .in('profile_id', friendIds)
    const finishedBy = new Map<string, boolean>()
    for (const r of (rows ?? []) as { profile_id: string; completed_at: string | null }[]) {
      finishedBy.set(r.profile_id, (finishedBy.get(r.profile_id) ?? false) || !!r.completed_at)
    }
    if (finishedBy.size === 0) return []

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, display_name, handle, avatar_url')
      .in('id', [...finishedBy.keys()])
      .eq('is_active', true)
      .limit(limit)
    return ((profiles ?? []) as { id: string; display_name: string; handle: string | null; avatar_url: string | null }[]).map((p) => ({
      id: p.id,
      name: p.display_name,
      handle: p.handle,
      avatarUrl: p.avatar_url,
      finished: finishedBy.get(p.id) ?? false,
    }))
  } catch {
    return []
  }
}

/** The one line under the faces: "Audrey and Priya are on it." / "Audrey, Priya and 2 more are on it." */
export function friendsLine(friends: readonly JourneyFriend[]): string | null {
  if (friends.length === 0) return null
  const first = friends.map((f) => f.name.trim().split(/\s+/)[0])
  const names =
    first.length === 1
      ? first[0]
      : first.length === 2
        ? `${first[0]} and ${first[1]}`
        : `${first[0]}, ${first[1]} and ${first.length - 2} more`
  const done = friends.filter((f) => f.finished).length
  const verb = friends.length === 1 ? 'is' : 'are'
  return done === friends.length ? `${names} finished it.` : `${names} ${verb} on it.`
}
