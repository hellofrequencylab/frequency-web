import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { asCircleAccess, isListedCircle } from '@/lib/circles/visibility'
import type { PostScopeContext } from '@/components/feed/post-card'

// Where a post lives. A post's home is its `scope_id`: a CIRCLE (group/cluster
// visibility), an EVENT (a post tied to a gathering), a CHANNEL, a SPACE
// (post_type 'space_update' community posts), or a member's WALL/profile.
// Resolving it lets every surface render the same linked "author › context"
// attribution header, with the scope's own image where it has one.

/**
 * Batch-resolve a set of post scope_ids into header scope contexts. Returns a
 * pure resolver `(scopeId, authorId) => PostScopeContext | undefined`:
 *
 * - circle  → name + `/circles/[slug]` + `circles.image_url`
 * - event   → title + `/events/[slug]` + the public event-media cover URL
 * - channel → name + `/channels/[id]` (no image; the icon fallback renders)
 * - space   → brand name + `/spaces/[slug]` + `spaces.brand_logo_url`
 * - wall    → display name + `/people/[handle]` + the member's avatar
 *
 * A post scoped to the AUTHOR's own profile resolves to undefined — the author
 * link already says where it lives — as does a null/unresolved scope.
 *
 * Precedence is circle → event → channel → space → wall. Scope ids are uuids
 * drawn from disjoint tables, so a collision is not expected; the order only
 * fixes the read if one ever occurred.
 */
export async function buildScopeContextResolver(
  scopeIds: (string | null | undefined)[],
): Promise<(scopeId: string | null | undefined, authorId?: string | null) => PostScopeContext | undefined> {
  const byScope = new Map<string, PostScopeContext>()

  const ids = [...new Set(scopeIds.filter((s): s is string => !!s))]
  if (ids.length > 0) {
    const admin = createAdminClient()
    const [circlesR, eventsR, channelsR, spacesR, profilesR] = await Promise.all([
      // 🔴 THE ORIGIN CHIP IS WHERE THE FEED NAMES A CIRCLE (ADR-1015). This module is why a
      // public post inside a hidden circle leaked: the reader never selects from `circles`, the
      // CHIP does, through the admin client, with no filter. `access`/`unlisted` ride along so the
      // hidden ones can be dropped below. The feed RPCs already suppress those posts upstream —
      // this is the second lock, for every other caller of this resolver.
      admin.from('circles').select('id, name, slug, image_url, unlisted, access').in('id', ids),
      admin.from('events').select('id, title, slug, cover_image_path').in('id', ids),
      admin.from('channels').select('id, name').in('id', ids),
      admin.from('spaces').select('id, name, brand_name, slug, brand_logo_url').in('id', ids),
      admin.from('profiles').select('id, display_name, handle, avatar_url').in('id', ids),
    ])

    // Event covers live in the public 'event-media' bucket (same as the event
    // page); getPublicUrl is a local string build, no round-trip. Fail-safe to
    // no image — the header then falls back to the calendar icon.
    const eventCoverUrl = (path: string | null | undefined): string | null => {
      if (!path) return null
      try {
        return admin.storage.from('event-media').getPublicUrl(path).data?.publicUrl ?? null
      } catch {
        return null
      }
    }

    type CircleScopeRow = {
      id: string
      name: string
      slug: string
      image_url: string | null
      unlisted?: unknown
      access?: unknown
    }
    const circleRows = (circlesR.data ?? []) as unknown as CircleScopeRow[]

    // A LISTED circle's name is public face whatever its access mode — that is the lead funnel, and
    // a chip pointing at it is the funnel working. An UNLISTED CLOSED circle must not be named to
    // anyone who is not in it. The membership lookup is skipped entirely unless such a circle is
    // actually in this batch, so the common feed render costs exactly what it did.
    const hidden = circleRows.filter((c) => !isListedCircle(c.unlisted) && asCircleAccess(c.access) !== 'open')
    let myHiddenIds = new Set<string>()
    if (hidden.length > 0) {
      const myProfileId = await getMyProfileId()
      if (myProfileId) {
        const { data: mine } = await admin
          .from('memberships')
          .select('circle_id')
          .eq('profile_id', myProfileId)
          .eq('status', 'active')
          .in('circle_id', hidden.map((c) => c.id))
        myHiddenIds = new Set(((mine ?? []) as { circle_id: string }[]).map((m) => m.circle_id))
      }
    }

    for (const c of circleRows) {
      const isHidden = !isListedCircle(c.unlisted) && asCircleAccess(c.access) !== 'open'
      // Dropping the chip rather than the post: the post itself was published by its author and is
      // gated by `posts.visibility`. What must not travel with it is the NAME of a room the viewer
      // is not entitled to know exists.
      if (isHidden && !myHiddenIds.has(c.id)) continue
      byScope.set(c.id, { type: 'circle', name: c.name, href: `/circles/${c.slug}`, image_url: c.image_url })
    }
    for (const e of (eventsR.data ?? []) as { id: string; title: string; slug: string; cover_image_path: string | null }[]) {
      if (!byScope.has(e.id)) {
        byScope.set(e.id, { type: 'event', name: e.title, href: `/events/${e.slug}`, image_url: eventCoverUrl(e.cover_image_path) })
      }
    }
    for (const ch of (channelsR.data ?? []) as { id: string; name: string }[]) {
      if (!byScope.has(ch.id)) {
        byScope.set(ch.id, { type: 'channel', name: ch.name, href: `/channels/${ch.id}`, image_url: null })
      }
    }
    for (const s of (spacesR.data ?? []) as { id: string; name: string | null; brand_name: string | null; slug: string; brand_logo_url: string | null }[]) {
      if (!byScope.has(s.id)) {
        byScope.set(s.id, {
          type: 'space',
          name: s.brand_name?.trim() || s.name || 'Space',
          href: `/spaces/${s.slug}`,
          image_url: s.brand_logo_url,
        })
      }
    }
    for (const p of (profilesR.data ?? []) as { id: string; display_name: string; handle: string; avatar_url: string | null }[]) {
      if (!byScope.has(p.id)) {
        byScope.set(p.id, {
          type: 'wall',
          name: p.display_name,
          href: `/people/${p.handle}`,
          image_url: p.avatar_url,
          handle: p.handle,
        })
      }
    }
  }

  return (scopeId, authorId) => {
    if (!scopeId) return undefined
    const ctx = byScope.get(scopeId)
    if (!ctx) return undefined
    // Posting to your OWN profile is just posting — the author link is the where.
    if (ctx.type === 'wall' && authorId && authorId === scopeId) return undefined
    return ctx
  }
}
