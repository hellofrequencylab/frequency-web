// CIRCLE PRIVACY — TWO AXES, written once for app code (ADR-1015, C1).
//
// ── WHY TWO AXES ─────────────────────────────────────────────────────────────────────────────
//
// The owner: "Space circles can be listed or unlisted, as well as set to private. A listed private
// circle basically works as a lead funnel into that space. A space owner can set permissions for a
// circle in their membership settings. For example: A space can have a private circle that space
// members can only access if they are a member."
//
// So DISCOVERABILITY and ACCESS are independent, and a single ordered public/unlisted/private enum
// cannot express the cell the owner named — a LISTED CLOSED circle, found in the index by name,
// Host and description so a stranger can decide to join or buy, with the roster and the posts shut.
//
//   AXIS 1  `circles.unlisted` (existing boolean, untouched) — does it appear in discovery?
//   AXIS 2  `circles.access`   (new)                          — who may enter and see content?
//
// ⚠️ Do NOT collapse these into one enum. The funnel cell only exists while they are separate.
//
// ── THE TWO QUESTIONS THAT USED TO BE ONE ────────────────────────────────────────────────────
//
//   canSeeCircle()    may this viewer see THAT IT EXISTS?  → the row: name, Host, about, count
//   canEnterCircle()  may this viewer see WHAT IS IN IT?   → roster, posts, tabs
//
// A listed closed Circle answers YES then NO. Every read path has to pick the right one, and the
// audit in the C1 report records which each path asks.
//
// ── WHY THIS MODULE EXISTS AT ALL ────────────────────────────────────────────────────────────
//
// The database enforces both for every session-client and anon read: `circles_access_restrictive`
// is an `AS RESTRICTIVE FOR SELECT` policy over `private.can_see_circle`, and the SECURITY DEFINER
// RPCs carry their own filter. That layer cannot be forgotten.
//
// 🔴 BUT RLS IS NOT THE WHOLE STORY. A large share of the circle surface reads through the
// SERVICE-ROLE client, which holds BYPASSRLS: the entire circle detail route (loadCircleShell),
// /api/search-scopes, the Interest page, the sidebar rails, Vera's suggestCircle, joinCircle
// itself. For every one of those the policy is invisible and the rule has to be applied BY HAND.
// A rule applied by hand in a dozen places is a rule that will be wrong in one of them, so it is
// written once, here, and imported.
//
// PURE. No Supabase, no Next, no React — so it unit-tests without a database, matching
// lib/circles/transfer.ts (ADR-843) and lib/events/host-gate.ts (ADR-841).

/**
 * AXIS 2. Who may enter a Circle and see what is inside. Set per Circle by the Space owner, in the
 * same membership settings that already link a tier to a Circle (ADR-859).
 *
 * `invite` and `tier` both resolve through a real `memberships` row once someone is actually in:
 * redeeming an invite and buying a tier each WRITE that row, so entry is a durable fact and never
 * a live re-check against Stripe. What the mode governs is the DOOR.
 */
export type CircleAccess = 'open' | 'circle_members' | 'space_members' | 'invite' | 'tier'

export const CIRCLE_ACCESS_MODES: readonly CircleAccess[] = [
  'open',
  'circle_members',
  'space_members',
  'invite',
  'tier',
]

/** Member-facing labels. Voice per docs/CONTENT-VOICE.md: plain sentences, no em dashes, no
 *  narrating how the reader feels. */
export const CIRCLE_ACCESS_LABEL: Record<CircleAccess, string> = {
  open: 'Anyone can join',
  circle_members: 'Members only',
  space_members: 'Space members only',
  invite: 'By invite only',
  tier: 'Included with a membership',
}

/** Which modes need a real (non-root) owning Space. A personal Circle lives on the root sentinel,
 *  which has no roster to admit from and sells nothing, so both are nonsense there. The database
 *  refuses them outright (`trg_circles_access_shape`); this is the same list for the UI. */
export const SPACE_ONLY_ACCESS_MODES: readonly CircleAccess[] = ['space_members', 'tier']

/** Narrow an arbitrary value (a raw `circles.access`, an untyped admin-client row) to a known
 *  mode. A pre-`access` row has no value at all and reads `open`, which is what it behaved as.
 *  Anything UNRECOGNISED reads as `circle_members` — the closed default — so a schema drift shuts
 *  a Circle rather than opening one. */
export function asCircleAccess(raw: unknown): CircleAccess {
  if (
    raw === 'open' ||
    raw === 'circle_members' ||
    raw === 'space_members' ||
    raw === 'invite' ||
    raw === 'tier'
  ) {
    return raw
  }
  if (raw === null || raw === undefined) return 'open'
  return 'circle_members'
}

/** AXIS 1. `circles.unlisted` is the column; this is its reader, so a caller never has to remember
 *  which way the boolean points. A listed Circle appears in discovery WHATEVER its access mode. */
export function isListedCircle(unlisted: unknown): boolean {
  return unlisted !== true
}

/** The facts both gates decide over. Every field is something a caller already has; nothing here
 *  implies a database round trip of its own. */
export interface CircleViewerFacts {
  /** `circles.unlisted` — axis 1. */
  unlisted: boolean
  /** `circles.access` — axis 2. */
  access: CircleAccess
  /** `circles.host_id`. */
  hostId: string | null
  /** The signed-in caller's profile id (null = signed out). */
  viewerProfileId: string | null
  /** Does the viewer hold an ACTIVE membership in this Circle? */
  isMember: boolean
  /** Is the viewer an active member of the Space that OWNS this Circle? Only opens a Circle whose
   *  access is `space_members` — Space membership is not a general key to a Space's Circles. */
  isSpaceMember: boolean
  /** Does the viewer steward the owning Space (owner / editor+)? For a personal Circle this is the
   *  ROOT space, so only platform staff can be true here — which is exactly why
   *  `private.can_view_space_content` cannot carry personal-circle privacy on its own. */
  isSpaceSteward: boolean
  /** `web_role` is admin or janitor. Break-glass for moderation and support. NOT `community_role`:
   *  a `guide` rank moderates the community, it is not a key to somebody's private room. */
  isPlatformStaff: boolean
}

/**
 * MAY THIS VIEWER SEE WHAT IS IN IT? The content question: roster, posts, tabs, momentum.
 * The app-layer twin of `private.can_enter_circle`, arm for arm and in the same order.
 */
export function canEnterCircle(f: CircleViewerFacts): boolean {
  if (f.access === 'open') return true
  if (f.isMember) return true
  if (f.hostId !== null && f.viewerProfileId !== null && f.hostId === f.viewerProfileId) return true
  if (f.access === 'space_members' && f.isSpaceMember) return true
  if (f.isSpaceSteward) return true
  if (f.isPlatformStaff) return true
  return false
}

/**
 * MAY THIS VIEWER SEE THAT IT EXISTS? The `circles` row question, and the whole reason the axes
 * are split. The app-layer twin of `private.can_see_circle`.
 *
 * A LISTED Circle is public FACE no matter how shut its access is: that IS the lead funnel. An
 * UNLISTED OPEN Circle still resolves by direct link (the 2026-11 contract, preserved). An
 * UNLISTED CLOSED Circle is the fully-hidden one, and only someone who may enter may learn it is
 * there.
 */
export function canSeeCircle(f: CircleViewerFacts): boolean {
  if (isListedCircle(f.unlisted)) return true
  if (f.access === 'open') return true
  return canEnterCircle(f)
}

/**
 * May this viewer JOIN on their own? Each closed mode has its own door, and the default is deny:
 *
 *   open            self-serve, exactly as today
 *   space_members   a member of the owning Space walks in; nobody else does
 *   invite          only a caller HOLDING an invite (an invite link or a Host-minted QR)
 *   circle_members  no public door at all; the Host adds you
 *   tier            buying the linked tier writes the membership row, so the join never comes
 *                   through here at all — hence a plain refusal with a reason the UI can act on
 *
 * `invited` is passed explicitly by the caller that HOLDS the invite, so an un-invited path cannot
 * acquire the right by accident: the default is `false`.
 */
export function canJoinCircle(
  f: CircleViewerFacts & { invited?: boolean },
): { ok: true } | { ok: false; reason: 'signed-out' | 'invite-only' | 'space-members-only' | 'paid' | 'closed' } {
  if (f.viewerProfileId === null) return { ok: false, reason: 'signed-out' }
  if (f.access === 'open') return { ok: true }
  // Already inside, or authoritative over it: joining is a no-op, not a refusal.
  if (canEnterCircle(f)) return { ok: true }
  if (f.invited === true) return { ok: true }
  if (f.access === 'space_members') return { ok: false, reason: 'space-members-only' }
  if (f.access === 'tier') return { ok: false, reason: 'paid' }
  if (f.access === 'invite') return { ok: false, reason: 'invite-only' }
  return { ok: false, reason: 'closed' }
}

/**
 * What a viewer who may SEE a Circle but may not ENTER it is allowed to be shown: the public face
 * of the funnel. Named as a list rather than left to each surface's judgement, because "which
 * fields are safe" is exactly the decision that drifts.
 *
 * Roster, posts, events, crew tasks, Journey runs and every tab body are NOT here.
 */
export const CIRCLE_PUBLIC_FACE_FIELDS = [
  'id',
  'name',
  'slug',
  'about',
  'image_url',
  'type',
  'member_count',
  'member_cap',
  'status',
  'city',
  'neighborhood',
  'host',
] as const
