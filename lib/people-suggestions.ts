import { createAdminClient } from '@/lib/supabase/admin'

// "People you may know" — the suggestion engine behind the Community directory
// section (BUILD-LIST P5 "friend suggestions"). REAL signals only, never
// fabricated:
//   • shared active circles  — memberships the viewer and the candidate hold in
//     the same circle, both `status = 'active'`
//   • mutual connections     — accepted friendships (friendships table,
//     user_a_id/user_b_id/status='accepted') the viewer and candidate share
//
// Excluded, always:
//   • the viewer themself
//   • anyone with ANY friendship row involving the viewer (pending either way,
//     accepted, …) — they're already connected or already in motion
//   • blocked pairs in either direction (blocked_users, ADR-036)
//   • demo (`is_demo`), system (`is_system`) and inactive profiles
//   • members who opted out of discovery — ghost_mode on, or discoverable_by
//     outside ('community','connections'): the same tiers the near_misses RPC
//     honours (ADR-186)
//
// A candidate with zero genuine signal is never suggested; callers render
// nothing when the list is empty. Reads run on the admin client (bypasses RLS),
// so the viewer scoping above IS the access control — keep it complete.

export interface PersonSuggestion {
  id: string
  handle: string
  displayName: string
  avatarUrl: string | null
  lastSeenAt: string | null
  /** Active circles the viewer and this member are both in. */
  sharedCircles: number
  /** Accepted connections of the viewer who are also connected to this member. */
  mutualConnections: number
}

/** "2 circles in common · 3 mutual connections" — built only from real counts,
 *  so it can never claim a reason that doesn't exist. */
export function suggestionReason(
  s: Pick<PersonSuggestion, 'sharedCircles' | 'mutualConnections'>,
): string {
  const bits: string[] = []
  if (s.sharedCircles > 0)
    bits.push(`${s.sharedCircles} circle${s.sharedCircles === 1 ? '' : 's'} in common`)
  if (s.mutualConnections > 0)
    bits.push(`${s.mutualConnections} mutual connection${s.mutualConnections === 1 ? '' : 's'}`)
  return bits.join(' · ')
}

export async function getPeopleSuggestions(
  viewerProfileId: string,
  limit = 6,
): Promise<PersonSuggestion[]> {
  const admin = createAdminClient()

  // The viewer's own graph, fetched in parallel: active circles, every
  // friendship row in any status (one canonical row per pair — its other end is
  // excluded), and blocks in either direction.
  const [{ data: myMemberships }, { data: myFriendships }, { data: blocks }] = await Promise.all([
    admin
      .from('memberships')
      .select('circle_id')
      .eq('profile_id', viewerProfileId)
      .eq('status', 'active'),
    admin
      .from('friendships')
      .select('user_a_id, user_b_id, status')
      .or(`user_a_id.eq.${viewerProfileId},user_b_id.eq.${viewerProfileId}`),
    admin
      .from('blocked_users')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${viewerProfileId},blocked_id.eq.${viewerProfileId}`),
  ])

  const myCircleIds = (myMemberships ?? []).map((m) => m.circle_id)
  const excluded = new Set<string>([viewerProfileId])
  const friendIds: string[] = []
  for (const f of myFriendships ?? []) {
    const other = f.user_a_id === viewerProfileId ? f.user_b_id : f.user_a_id
    excluded.add(other)
    if (f.status === 'accepted') friendIds.push(other)
  }
  for (const b of blocks ?? []) {
    excluded.add(b.blocker_id === viewerProfileId ? b.blocked_id : b.blocker_id)
  }

  // Both signals in parallel. Community-scale reads (a member's circles and
  // friends-of-friends are small sets); each query is bounded by PostgREST's
  // row cap, which is far above any realistic neighbourhood here.
  const [coMembers, viaA, viaB] = await Promise.all([
    myCircleIds.length > 0
      ? admin
          .from('memberships')
          .select('profile_id')
          .in('circle_id', myCircleIds)
          .eq('status', 'active')
          .neq('profile_id', viewerProfileId)
          .then((r) => r.data ?? [])
      : Promise.resolve([] as { profile_id: string }[]),
    friendIds.length > 0
      ? admin
          .from('friendships')
          .select('user_a_id, user_b_id')
          .eq('status', 'accepted')
          .in('user_a_id', friendIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([] as { user_a_id: string; user_b_id: string }[]),
    friendIds.length > 0
      ? admin
          .from('friendships')
          .select('user_a_id, user_b_id')
          .eq('status', 'accepted')
          .in('user_b_id', friendIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([] as { user_a_id: string; user_b_id: string }[]),
  ])

  // Signal 1 — shared active circles. One membership row per (circle, member),
  // so counting rows counts distinct shared circles.
  const sharedCircleCount = new Map<string, number>()
  for (const m of coMembers) {
    if (excluded.has(m.profile_id)) continue
    sharedCircleCount.set(m.profile_id, (sharedCircleCount.get(m.profile_id) ?? 0) + 1)
  }

  // Signal 2 — mutual accepted connections (friend-of-friend). For each accepted
  // friendship touching one of MY friends, the far end is a candidate and my
  // friend is the mutual; a Set per candidate dedupes pairs seen from both sides.
  const mutualsByCandidate = new Map<string, Set<string>>()
  function addMutual(candidate: string, mutual: string) {
    if (excluded.has(candidate)) return
    let set = mutualsByCandidate.get(candidate)
    if (!set) {
      set = new Set()
      mutualsByCandidate.set(candidate, set)
    }
    set.add(mutual)
  }
  for (const f of viaA) addMutual(f.user_b_id, f.user_a_id)
  for (const f of viaB) addMutual(f.user_a_id, f.user_b_id)

  const candidateIds = [...new Set([...sharedCircleCount.keys(), ...mutualsByCandidate.keys()])]
  if (candidateIds.length === 0) return []

  // Visibility — the directory's own gates (active, non-system, never demo)
  // plus the ADR-186 discoverability tiers.
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, display_name, handle, avatar_url, last_seen_at')
    .in('id', candidateIds)
    .eq('is_active', true)
    .eq('is_system', false)
    .eq('is_demo', false)
    .eq('ghost_mode', false)
    .in('discoverable_by', ['community', 'connections'])

  return (profiles ?? [])
    .map((p) => ({
      id: p.id,
      handle: p.handle,
      displayName: p.display_name,
      avatarUrl: p.avatar_url,
      lastSeenAt: p.last_seen_at,
      sharedCircles: sharedCircleCount.get(p.id) ?? 0,
      mutualConnections: mutualsByCandidate.get(p.id)?.size ?? 0,
    }))
    // Belt-and-braces: never surface anyone without a genuine signal.
    .filter((s) => s.sharedCircles > 0 || s.mutualConnections > 0)
    .sort(
      (a, b) =>
        b.sharedCircles + b.mutualConnections - (a.sharedCircles + a.mutualConnections) ||
        b.mutualConnections - a.mutualConnections ||
        a.displayName.localeCompare(b.displayName),
    )
    .slice(0, limit)
}
