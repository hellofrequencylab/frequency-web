// MODERATION SCOPE (L7-1..L7-4). Who may act on content they do not own, decided in one pure
// place so every server action that writes through the admin client asks the same question the
// database would have asked.
//
// THE DEFECT THIS CLOSES. Four actions ran through `createAdminClient()` (RLS bypassed) and gated
// on `HOST_PLUS.includes(caller.community_role)`. But `host` is SELF-GRANTED: publishing a Circle
// runs `ensureHostOnOwnership` (lib/circles/remix.ts), which promotes the publisher to `host`. So
// "host+" was never a moderation credential; it was "has published a circle". The policies the
// admin client skipped are narrower and they say what host means:
//
//     posts: author delete or host removes in circle
//       author_id = get_my_profile_id()
//       OR (get_my_role() >= 'host'
//           AND scope_id IN (SELECT id FROM circles WHERE host_id = get_my_profile_id()))
//
// (supabase/migrations/20240102000000_hierarchy_v2.sql; the UPDATE policy `posts: author update or
// host pins in circle` has the identical predicate.) A host moderates the Circles they host, and
// nothing else. Platform-wide moderation is the STAFF axis, `profiles.web_role in ('admin',
// 'janitor')` (ADR-208), which no member can grant themselves.
//
// This module is pure (no React, Next, or Supabase) so the actions can unit-test the decision and
// the callers stay one query each: fetch the row, fetch the caller's hosted circle ids, ask.

import { atLeastRole, isStaff, type CommunityRole, type WebRole } from '@/lib/core/roles'
import { staffCan, type CapabilityOverrides, type StaffRole } from '@/lib/core/staff-roles'

// The coarse staff test, re-exported so a moderation call site imports one module. The
// definition lives in lib/core/roles.ts beside the WebRole type it narrows.
export { isStaff }

/** The two columns a post-level moderation decision needs. `scope_id` is the canonical scope
 *  column the policies read; a circle-scoped post carries its circle's id there (the typed
 *  `scope_circle_id` is a derived mirror, migration 20260829000000). */
export type PostScope = {
  author_id: string
  scope_id: string | null
}

export type PostModerationInput = {
  /** The caller's profile id. */
  callerId: string
  /** The caller's EFFECTIVE community role (view-as aware). */
  communityRole: CommunityRole | null | undefined
  /** The caller's EFFECTIVE staff web_role (view-as aware). */
  webRole: WebRole | null | undefined
  /** The post being deleted, pinned, or unpinned. */
  post: PostScope
  /** Ids of the circles the caller hosts (`circles.host_id = callerId`). */
  hostedCircleIds: readonly string[]
}

/**
 * May this caller delete, pin, or unpin this post? Mirrors the two `posts` policies exactly:
 *   1. the author, always;
 *   2. platform staff (web_role admin/janitor), anywhere;
 *   3. host+ on the community ladder, ONLY inside a circle the caller hosts.
 * A post with no scope, or scoped to an event or a profile wall, never matches arm 3: the
 * hosted-circle list contains circle ids only, so a non-circle scope cannot be in it.
 */
export function canModeratePost(input: PostModerationInput): boolean {
  const { callerId, communityRole, webRole, post, hostedCircleIds } = input
  if (post.author_id === callerId) return true
  if (isStaff(webRole)) return true
  if (!atLeastRole(communityRole, 'host')) return false
  return post.scope_id != null && hostedCircleIds.includes(post.scope_id)
}

/**
 * May this caller approve or reject a Library submission (a practice or a journey)? Staff only.
 * `practices` and `journey_plans` have no UPDATE policy at all (writes are service-role, "gated in
 * the server actions"), so this function IS the gate. There is deliberately no creator arm: the
 * creator submits (`submitToLibrary`) and someone else decides, otherwise review is a formality.
 */
export function canReviewLibrarySubmission(webRole: WebRole | null | undefined): boolean {
  return isStaff(webRole)
}

/**
 * May this caller manually award or revoke an achievement? Staff only, on either staff axis:
 * platform staff (web_role), or a team_members staff role that holds the `community` domain at
 * write, which is how `requireAdmin('host', { staff: 'community' })` admits the operator page
 * (app/(main)/admin/gamification/page.tsx). The community ladder does not open this: a badge is
 * platform-wide, and there is no circle to scope a host to.
 */
export function canAdministerAchievements(input: {
  webRole: WebRole | null | undefined
  staffRole: StaffRole | null | undefined
  overrides?: CapabilityOverrides
}): boolean {
  if (isStaff(input.webRole)) return true
  return staffCan(input.staffRole, 'community', 'write', input.overrides)
}
