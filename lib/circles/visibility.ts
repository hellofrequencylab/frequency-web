// CIRCLE VISIBILITY — the ONE place the privacy rule is written for app code (ADR-1015, C1).
//
// WHY THIS MODULE EXISTS. The database enforces the rule for every session-client and anon read:
// `circles_visibility_restrictive` is an `AS RESTRICTIVE FOR SELECT` policy, and the SECURITY
// DEFINER RPCs (`public_circles`, `public_circle_by_id`, `circles_near`, `circle_momentum`) carry
// the filter in their own bodies. That layer cannot be forgotten and cannot be stepped around.
//
// 🔴 BUT RLS IS NOT THE WHOLE STORY. A large share of the circle surface reads through the
// SERVICE-ROLE client, which holds BYPASSRLS: the entire circle detail route (loadCircleShell),
// /api/search-scopes, the sidebar circle rails, Vera's suggestCircle, joinCircle itself. For every
// one of those, the policy above is invisible and the rule has to be applied BY HAND. A rule
// applied by hand in eleven places is a rule that will be wrong in one of them, so it is written
// once, here, and imported.
//
// PURE. No Supabase, no Next, no React — so it unit-tests without a database, matching
// lib/circles/transfer.ts (ADR-843) and lib/events/host-gate.ts (ADR-841).

/** How reachable a Circle is. Mirrors `circles.visibility` and `spaces.visibility` (ADR-322). */
export type CircleVisibility = 'public' | 'unlisted' | 'private'

export const CIRCLE_VISIBILITIES: readonly CircleVisibility[] = ['public', 'unlisted', 'private']

/**
 * The visibilities a DISCOVERY surface may show: the index, the map, browse rails, `/discover`,
 * the sitemap, search pickers, Vera's suggestions, "circles to explore".
 *
 * Exactly one value, and that is the point: `unlisted` is out of discovery by definition, and
 * `private` is out of everything. Written as an array so a Supabase filter reads
 * `.in('visibility', DISCOVERABLE_CIRCLE_VISIBILITY)` and never drifts from this list.
 */
export const DISCOVERABLE_CIRCLE_VISIBILITY: readonly CircleVisibility[] = ['public']

/**
 * The visibilities that resolve BY DIRECT LINK to someone who is not a member: the discover detail
 * page, its metadata, its OG share card.
 *
 * `unlisted` is here on purpose — 20261157000000 chose that contract deliberately and C1 does not
 * revisit it. `private` is not, which is the entire difference between obscurity and privacy.
 */
export const LINKABLE_CIRCLE_VISIBILITY: readonly CircleVisibility[] = ['public', 'unlisted']

/** Narrow an arbitrary value (a raw `circles.visibility`, an untyped admin-client row) to a known
 *  visibility. FAIL-CLOSED is NOT the default here and that is deliberate: an unrecognised value
 *  reads as `'private'`, the most restrictive state, so a schema drift hides a circle rather than
 *  publishing one. */
export function asCircleVisibility(raw: unknown): CircleVisibility {
  if (raw === 'public' || raw === 'unlisted' || raw === 'private') return raw
  if (raw === null || raw === undefined) return 'public' // pre-migration rows have no column yet
  return 'private'
}

/** The facts the pure gate decides over. Every field is something a caller already has; nothing
 *  here implies a database round trip of its own. */
export interface CircleViewerFacts {
  visibility: CircleVisibility
  /** `circles.host_id`. */
  hostId: string | null
  /** The signed-in caller's profile id (null = signed out). */
  viewerProfileId: string | null
  /** Does the viewer hold an ACTIVE membership in this Circle? */
  isMember: boolean
  /** Does the viewer steward the Space that owns this Circle (owner / editor+)? For a personal
   *  Circle this is the ROOT space, so only platform staff can be true here — which is exactly
   *  why `private.can_view_space_content` cannot carry personal-circle privacy on its own. */
  isSpaceSteward: boolean
  /** `web_role` is admin or janitor. Break-glass for moderation and support. NOT `community_role`:
   *  a `guide` rank moderates the community, it is not a key to somebody's private room. */
  isPlatformStaff: boolean
}

/**
 * May this viewer READ this Circle's row? The app-layer twin of `private.can_view_circle`, arm for
 * arm — if one of them changes, the other must change in the same pass, and
 * `lib/circles/visibility.test.ts` pins the arms.
 */
export function canViewCircle(f: CircleViewerFacts): boolean {
  if (f.visibility !== 'private') return true
  if (f.isMember) return true
  if (f.hostId !== null && f.viewerProfileId !== null && f.hostId === f.viewerProfileId) return true
  if (f.isSpaceSteward) return true
  if (f.isPlatformStaff) return true
  return false
}

/** May this Circle appear on a DISCOVERY surface (index, map, rails, search, sitemap, Vera)?
 *  Viewer-independent on purpose: a discovery surface that made exceptions per viewer would leak
 *  the existence of the Circle through the shape of the list. Members reach their own unlisted and
 *  private Circles through their OWN lists, never through discovery. */
export function isDiscoverableCircle(visibility: CircleVisibility): boolean {
  return DISCOVERABLE_CIRCLE_VISIBILITY.includes(visibility)
}

/** May a stranger open this Circle by direct link (the /discover detail page and its share card)? */
export function isLinkableCircle(visibility: CircleVisibility): boolean {
  return LINKABLE_CIRCLE_VISIBILITY.includes(visibility)
}

/**
 * May this viewer JOIN this Circle on their own? A private Circle is not self-serve: the join has
 * to be INVITED — an invite link (`invite_links`), a QR code the Host minted, or a membership tier
 * the Space sold. Anything else and "private" means only "hidden from browse", which is what
 * `unlisted` already was.
 *
 * `invited` is passed explicitly by the caller that HOLDS the invite, so an un-invited path cannot
 * acquire the right by accident: the default is `false`.
 */
export function canJoinCircle(
  f: CircleViewerFacts & { invited?: boolean },
): { ok: true } | { ok: false; reason: 'signed-out' | 'invite-only' } {
  if (f.viewerProfileId === null) return { ok: false, reason: 'signed-out' }
  if (f.visibility !== 'private') return { ok: true }
  if (f.invited === true) return { ok: true }
  if (canViewCircle(f)) return { ok: true } // already a member / host / steward / staff
  return { ok: false, reason: 'invite-only' }
}
