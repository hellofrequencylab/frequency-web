// The network-FOLLOW ledger (ENTITY-SPACES-BUILD §A.4). The library behind the FollowSpaceButton:
//   space_follows: one row per (space_id, follower_profile_id) — a signed-in member follows a
//   networked Space. The relationship persists here (so a reload remembers it), feeds the
//   "Following" filter on the /spaces directory, and later the feed.
//
// Backed by the service-role admin client plus untyped casts (the table is not in the generated DB
// types yet, ADR-246, mirroring lib/spaces/membership.ts). The server is the authority: the writes
// (followSpace / unfollowSpace) re-check auth via getMyProfileId, and the reads fail-safe (false / 0
// / []) so a missing table or any error degrades quietly rather than throwing.
//
// SHAPE: this module has NO 'use server' directive, so it can ALSO export the read helpers the
// directory + button resolve server-side and the types the surfaces import. The thin 'use server'
// wrappers the CLIENT button calls live in lib/spaces/follows-actions.ts (a server-action module
// must export only async functions, so these read helpers cannot live there). SERVER components
// import the reads straight from here.
//
// Following is DISTINCT from membership: a member can follow a Space without joining it (space_members)
// and join without following. This file never touches space_members.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// ── The untyped query builder (the table isn't in the generated types yet, ADR-246) ──────────────

// `space_follows` is not in the generated DB types, so `createAdminClient().from('space_follows')`
// would fail the typed-table overload — reach the table through an untyped `from` accessor (ADR-246,
// the same shape lib/spaces/membership.ts uses for space_members) and type the builder loosely here.
type FollowRow = { space_id: string }

type FollowsQuery = {
  select: (cols: string, opts?: { count?: 'exact'; head?: boolean }) => FollowsQuery
  eq: (col: string, val: string) => FollowsQuery
  upsert: (rows: Record<string, unknown>, opts: { onConflict: string }) => FollowsQuery
  delete: () => FollowsQuery
  maybeSingle: () => Promise<{ data: { id: string } | null; error: unknown }>
  then: (
    resolve: (r: { data: FollowRow[] | null; error: unknown; count: number | null }) => unknown,
  ) => Promise<unknown>
}

/** The untyped admin-client `space_follows` builder (the table isn't in the generated types yet). */
function followsTable(): FollowsQuery {
  const db = createAdminClient() as unknown as { from: (table: string) => FollowsQuery }
  return db.from('space_follows')
}

// ── Writes (server actions; authenticated member) ─────────────────────────────────────────────────

/**
 * Follow a Space as the signed-in member. IDEMPOTENT: upserts on the (space_id, follower_profile_id)
 * unique key, so following an already-followed Space is a no-op success rather than a duplicate or
 * an error. Re-checks auth (getMyProfileId) and confirms the Space exists. Revalidates the directory
 * + the Space profile so the follower count + "Following" filter reflect the change.
 */
export async function followSpace(spaceId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to follow a space.')

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  try {
    const { error } = await followsTable()
      .upsert(
        { space_id: spaceId, follower_profile_id: profileId },
        { onConflict: 'space_id,follower_profile_id' },
      )
      .select('id')
      .maybeSingle()
    if (error) return fail('Could not follow this space. Try again.')
  } catch {
    return fail('Could not follow this space. Try again.')
  }

  revalidatePath(`/spaces/${space.slug}`, 'layout')
  revalidatePath('/spaces')
  return ok()
}

/**
 * Unfollow a Space as the signed-in member. IDEMPOTENT: deleting a follow that isn't there is a
 * no-op success. Re-checks auth (getMyProfileId) and confirms the Space exists. Revalidates the
 * directory + the Space profile.
 */
export async function unfollowSpace(spaceId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to manage who you follow.')

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  try {
    const { error } = await followsTable()
      .delete()
      .eq('space_id', spaceId)
      .eq('follower_profile_id', profileId)
    if (error) return fail('Could not unfollow this space. Try again.')
  } catch {
    return fail('Could not unfollow this space. Try again.')
  }

  revalidatePath(`/spaces/${space.slug}`, 'layout')
  revalidatePath('/spaces')
  return ok()
}

// ── Reads (fail-safe; server components resolve these directly) ────────────────────────────────────

/** Whether `profileId` currently follows the Space. Service-role read; FAIL-SAFE (false on any error
 *  or a missing profile), so the button defaults to the un-followed state rather than throwing. */
export async function isFollowing(spaceId: string, profileId: string | null): Promise<boolean> {
  if (!profileId) return false
  try {
    const { data, error } = await followsTable()
      .select('id')
      .eq('space_id', spaceId)
      .eq('follower_profile_id', profileId)
      .maybeSingle()
    if (error || !data) return false
    return true
  } catch {
    return false
  }
}

/** How many members follow this Space. Service-role count read; FAIL-SAFE (0 on any error), so a
 *  brand-new or pre-migration Space resolves to zero followers. */
export async function followerCount(spaceId: string): Promise<number> {
  try {
    const result = (await followsTable()
      .select('space_id', { count: 'exact', head: true })
      .eq('space_id', spaceId)) as { count: number | null; error: unknown }
    if (result.error) return 0
    return result.count ?? 0
  } catch {
    return 0
  }
}

/** The set of Space ids `profileId` follows — the input to the directory's "Following" filter.
 *  Service-role read; FAIL-SAFE (empty set on a missing profile or any error). */
export async function listFollowedSpaceIds(profileId: string | null): Promise<Set<string>> {
  const ids = new Set<string>()
  if (!profileId) return ids
  try {
    const result = (await followsTable()
      .select('space_id')
      .eq('follower_profile_id', profileId)) as { data: FollowRow[] | null; error: unknown }
    if (result.error || !result.data) return ids
    for (const row of result.data) ids.add(row.space_id)
    return ids
  } catch {
    return ids
  }
}
