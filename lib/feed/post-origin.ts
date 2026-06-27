import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// Where a post lives. A post's home is its `scope_id`: a CIRCLE (group/cluster
// visibility) or a member's WALL/profile (public/region). Resolving it lets every
// profile-timeline post say where it was posted and what it's tied to.
export type PostOrigin =
  | { kind: 'circle'; name: string; slug: string }
  | { kind: 'wall'; name: string; handle: string }
  | { kind: 'feed' }

/**
 * Batch-resolve a set of post scope_ids into an origin lookup. Returns a pure
 * resolver `(scopeId) => PostOrigin`: a scope that matches a circle reads as that
 * circle; one that matches ANOTHER member's profile reads as their wall; the member's
 * own profile id (or anything unresolved) reads as the public feed. `selfProfileId`
 * is the timeline owner — a post scoped to their own profile is "shared to the feed",
 * not "on someone's wall".
 */
export async function buildPostOriginResolver(
  scopeIds: (string | null | undefined)[],
  selfProfileId: string,
): Promise<(scopeId: string | null | undefined) => PostOrigin> {
  const circleByScope = new Map<string, { name: string; slug: string }>()
  const profileByScope = new Map<string, { name: string; handle: string }>()

  const ids = [...new Set(scopeIds.filter((s): s is string => !!s))]
  if (ids.length > 0) {
    const admin = createAdminClient()
    const [circlesR, profilesR] = await Promise.all([
      admin.from('circles').select('id, name, slug').in('id', ids),
      admin.from('profiles').select('id, display_name, handle').in('id', ids),
    ])
    for (const c of (circlesR.data ?? []) as { id: string; name: string; slug: string }[]) {
      circleByScope.set(c.id, { name: c.name, slug: c.slug })
    }
    for (const p of (profilesR.data ?? []) as { id: string; display_name: string; handle: string }[]) {
      profileByScope.set(p.id, { name: p.display_name, handle: p.handle })
    }
  }

  return (scopeId) => {
    if (scopeId && circleByScope.has(scopeId)) {
      const c = circleByScope.get(scopeId)!
      return { kind: 'circle', name: c.name, slug: c.slug }
    }
    if (scopeId && scopeId !== selfProfileId && profileByScope.has(scopeId)) {
      const p = profileByScope.get(scopeId)!
      return { kind: 'wall', name: p.name, handle: p.handle }
    }
    return { kind: 'feed' }
  }
}
