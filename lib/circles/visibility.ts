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
 *
 * ⚠️ THE TWO SPACE MODES ARE TWO AUDIENCES (OWN-034 ruling C, ADR-1092). `space_members` admits
 * the Space's STAFF ladder (`space_members` seats: viewer < editor < moderator < admin — the
 * people who run the Space), and `space_paid_members` admits the Space's ACTIVE paying members
 * (`space_memberships`). The tables have near-identical names and are NOT the same people; the
 * old copy promised the payers while the mode admitted the staff, and the ruling's answer was
 * one mode per audience, never one mode wearing both labels.
 */
export type CircleAccess =
  | 'open'
  | 'circle_members'
  | 'space_members'
  | 'space_paid_members'
  | 'invite'
  | 'tier'

export const CIRCLE_ACCESS_MODES: readonly CircleAccess[] = [
  'open',
  'circle_members',
  'space_members',
  'space_paid_members',
  'invite',
  'tier',
]

/** Member-facing labels. Voice per docs/CONTENT-VOICE.md: plain sentences, no em dashes, no
 *  narrating how the reader feels. NOTE the pair that must never swap back: `space_members` is the
 *  TEAM (the mode key names the staff table), and `space_paid_members` is the Space's members in
 *  the operator's own language — the people who bought a membership. */
export const CIRCLE_ACCESS_LABEL: Record<CircleAccess, string> = {
  open: 'Anyone can join',
  circle_members: 'Members only',
  space_members: 'Space team only',
  space_paid_members: 'Space members only',
  invite: 'By invite only',
  tier: 'Included with a membership',
}

/** One line of explanation per mode, for the control that sets it. Same voice rules as the labels:
 *  plain sentences, no em dashes, and no telling the reader what to feel about their own Circle. */
export const CIRCLE_ACCESS_HINT: Record<CircleAccess, string> = {
  open: 'Anyone who finds this circle can join it straight away.',
  circle_members: 'People get in only when you add them. Nobody else sees inside.',
  space_members: 'People on your Space team can join themselves. Members cannot.',
  space_paid_members: 'Anyone with an active membership in your Space can join themselves.',
  invite: 'An invite link or a QR code is the only way in.',
  tier: 'Joining comes with a paid membership tier you set up in your Space.',
}

/** The one sentence a control shows when it is offering FEWER than all five modes, and the one
 *  sentence the save action refuses with. Written once because a note and a refusal that disagree
 *  teach an operator two different rules for the same wall. */
export const CIRCLE_ACCESS_LIMIT_NOTE =
  'Space team access, Space member access, and paid membership tiers are for circles a Space owns. Selling a tier comes with the Business plan.'

/** Which modes need a real (non-root) owning Space. A personal Circle lives on the root sentinel,
 *  which has no team, no memberships to admit from, and sells nothing, so all three are nonsense
 *  there. The database refuses them outright (`trg_circles_access_shape`); this is the same list
 *  for the UI. */
export const SPACE_ONLY_ACCESS_MODES: readonly CircleAccess[] = [
  'space_members',
  'space_paid_members',
  'tier',
]

/** The plans that may SELL access to a Circle. A mirror of `private.space_can_sell`
 *  (20270227000000), and the drift between the two is asserted in visibility.test.ts against the
 *  migration text, because two lists of plan names WILL diverge otherwise and the failure mode is
 *  silent: the UI offers a paid mode the trigger then refuses, which reads to an operator as the
 *  save button being broken.
 *
 *  The second block is grandfathering, not aliasing. Those rows predate the plan rename and must
 *  not lose the ability to sell just because the label moved. */
export const SPACE_SELLING_PLANS: readonly string[] = [
  'business', 'collective', 'nonprofit', 'independent',
  'pro', 'practitioner', 'partner', 'organization', 'whitelabel',
]

/** May this Space put a Circle behind a paid tier? Two conditions, both from the SQL: it must be a
 *  REAL Space (a personal Circle lives on the root sentinel, which sells nothing) and it must be on
 *  a selling plan. A missing plan reads `free`, which is the same fail-closed direction the
 *  database takes. */
export function spaceCanSell(space: { type?: string | null; plan?: string | null } | null): boolean {
  if (!space || !space.type || space.type === 'root') return false
  return SPACE_SELLING_PLANS.includes(space.plan ?? 'free')
}

/** Which access modes this Circle may actually be set to, given the Space that owns it.
 *
 *  The UI must not offer a mode the trigger will refuse. Both refusals are real and both are
 *  raised by `trg_circles_access_shape`: `circle_access_needs_space` for the three Space modes on
 *  a personal Circle, and `circle_access_plan_floor` for `tier` below the Business plan. This is the
 *  same rule stated once so the form and the database cannot disagree.
 *
 *  ⚠️ This narrows what is OFFERED. It is not the enforcement, and it must never become the only
 *  check: the trigger fires on the service role too, which is the guarantee that survives an
 *  admin-client write, a Stripe webhook, or a future form nobody has written yet. */
export function availableAccessModes(
  space: { type?: string | null; plan?: string | null } | null,
): readonly CircleAccess[] {
  const isRealSpace = !!space?.type && space.type !== 'root'
  return CIRCLE_ACCESS_MODES.filter((mode) => {
    if (SPACE_ONLY_ACCESS_MODES.includes(mode) && !isRealSpace) return false
    if (mode === 'tier' && !spaceCanSell(space)) return false
    return true
  })
}

/** What a PICKER should list for a Circle that currently sits on `current`.
 *
 *  `availableAccessModes` says what may be SET. That is not the same list: a Circle can already be
 *  sitting on a mode it could no longer be moved to, because the Space that owns it dropped off a
 *  selling plan while a `tier` Circle stayed as it was. Dropping the current mode from the list
 *  would make the select claim the Circle is something it is not, and the first save would silently
 *  change access nobody asked to change. So the current mode stays listed, in canonical order —
 *  the same rule the Channel picker follows for a paused Channel. */
export function accessModeOptions(
  space: { type?: string | null; plan?: string | null } | null,
  current: CircleAccess,
): readonly CircleAccess[] {
  const available = availableAccessModes(space)
  return CIRCLE_ACCESS_MODES.filter((mode) => available.includes(mode) || mode === current)
}

/** Narrow an arbitrary value (a raw `circles.access`, an untyped admin-client row) to a known
 *  mode. A pre-`access` row has no value at all and reads `open`, which is what it behaved as.
 *  Anything UNRECOGNISED reads as `circle_members` — the closed default — so a schema drift shuts
 *  a Circle rather than opening one. */
export function asCircleAccess(raw: unknown): CircleAccess {
  if (
    raw === 'open' ||
    raw === 'circle_members' ||
    raw === 'space_members' ||
    raw === 'space_paid_members' ||
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

/** THE LIFECYCLE AXIS, which is not axis 1 or axis 2 and keeps being mistaken for them.
 *
 *  `circles.status` says where a Circle is in its life, not who may see it. A `forming` Circle is
 *  a real Circle that is gathering people — it belongs in discovery exactly as much as an `active`
 *  one, and the operator create path (app/(main)/admin/actions.ts) defaults new rows to `forming`,
 *  so filtering it out hides precisely the Circles an operator just made.
 *
 *  This constant exists because `listPublicSpaceCircles` pinned `status = 'active'` while every
 *  other public reader admitted `forming` too (lib/nearby/map-pins.ts, lib/channels/programs.ts,
 *  lib/circles/remix.ts). The result was a Space whose Circles tab did not appear at all, whose
 *  hero read "Circles 0", and whose own manage console listed the rows the profile denied — live
 *  in production on 2026-08-24 (LIVE-093).
 *
 *  NOT the same set as the one in lib/people/associations.ts, deliberately. That reader also
 *  admits `inactive`, because a person's history is a different question from what a Space is
 *  offering now. `draft` is in neither: a draft is not yet a Circle anyone else may see.
 *
 *  Deliberately NOT annotated `readonly string[]`, though every other constant in this file is.
 *  `circles.status` is a typed enum in the generated types ('forming' | 'active' | 'draft' |
 *  'inactive' | 'archived'), so widening this to string[] makes `.in('status', [...])` fail to
 *  compile — the literal types are what let a caller pass it straight to PostgREST, and what
 *  would reject a typo here at build time rather than at read time. */
export const LISTABLE_CIRCLE_STATUS = ['forming', 'active'] as const

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
  /** Does the viewer hold a seat on the owning Space's TEAM (owner, or an active `space_members`
   *  row of any rung)? Only opens a Circle whose access is `space_members` — a seat is not a
   *  general key to a Space's Circles. STAFF, not the paying audience (OWN-034 ruling C). */
  isSpaceMember: boolean
  /** Does the viewer hold an ACTIVE paid membership (`space_memberships`) in the owning Space?
   *  Only opens a Circle whose access is `space_paid_members`, and never merges with the seat
   *  fact above — the two audiences staying separate IS the OWN-034 ruling. */
  isSpacePaidMember: boolean
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
  if (f.access === 'space_paid_members' && f.isSpacePaidMember) return true
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
 *   open                self-serve, exactly as today
 *   space_members       someone on the owning Space's team walks in; nobody else does
 *   space_paid_members  an active paid member of the owning Space walks in; nobody else does
 *   invite              only a caller HOLDING an invite (an invite link or a Host-minted QR)
 *   circle_members      no public door at all; the Host adds you
 *   tier                buying the linked tier writes the membership row, so the join never comes
 *                       through here at all — hence a plain refusal with a reason the UI can act on
 *
 * `invited` is passed explicitly by the caller that HOLDS the invite, so an un-invited path cannot
 * acquire the right by accident: the default is `false`.
 */
export function canJoinCircle(
  f: CircleViewerFacts & { invited?: boolean },
):
  | { ok: true }
  | {
      ok: false
      reason: 'signed-out' | 'invite-only' | 'space-members-only' | 'membership-only' | 'paid' | 'closed'
    } {
  if (f.viewerProfileId === null) return { ok: false, reason: 'signed-out' }
  if (f.access === 'open') return { ok: true }
  // Already inside, or authoritative over it: joining is a no-op, not a refusal.
  if (canEnterCircle(f)) return { ok: true }
  if (f.invited === true) return { ok: true }
  if (f.access === 'space_members') return { ok: false, reason: 'space-members-only' }
  if (f.access === 'space_paid_members') return { ok: false, reason: 'membership-only' }
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
