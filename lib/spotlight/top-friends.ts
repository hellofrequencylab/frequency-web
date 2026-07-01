import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { MAX_TOP_FRIENDS } from './blocks/schema'
import type { TopFriend } from './top-friends.types'

// The TopFriend shape lives in the client-safe ./top-friends.types module (so the
// Puck blocks can import it without this server-only file). Re-exported here so every
// existing importer of `TopFriend` from '@/lib/spotlight/top-friends' keeps working.
export type { TopFriend } from './top-friends.types'

// Spotlight Top Friends (the "Top 8"): the server-side source of truth for which
// friends a member features, in order, on their Spotlight. The picks live in the
// `spotlight_top_friends` table (FK to profiles, ordered by `position`); the layout
// block (type 'topfriends') only marks WHERE the grid renders, never WHO is in it —
// so, like the `stats` block, the displayed people are governed server-side and can't
// be spoofed by a tampered meta blob.
//
// Two responsibilities split for testability:
//   • Pure logic (normalize/validate a requested pick set) — no IO, unit-tested.
//   • IO (read the ordered grid, joined to each friend's PUBLIC profile fields).
// The server actions (app/(main)/settings/profile/spotlight-actions.ts) own auth +
// the friendship check + the writes; this module owns the shape + the read.

// ── The untyped admin-client seam (spotlight_top_friends not in the generated DB types
// yet, ADR-246). Mirrors lib/spaces/segments.ts. The `profiles` / `friendships` reads
// below stay on the TYPED client — only the new table goes through this seam. The
// integrator step regenerates lib/database.types.ts and drops this cast. ──────────────
type TopFriendRow = { friend_profile_id: string; position: number }
type TopFriendQuery = {
  select: (cols: string) => TopFriendQuery
  eq: (col: string, val: string) => TopFriendQuery
  order: (col: string, opts: { ascending: boolean }) => TopFriendQuery
  limit: (n: number) => TopFriendQuery
  insert: (rows: Record<string, unknown>[]) => Promise<{ error: { message: string } | null }>
  delete: () => TopFriendQuery
  then: (resolve: (r: { data: TopFriendRow[] | null; error: { message: string } | null }) => unknown) => Promise<unknown>
}
/** The untyped `spotlight_top_friends` query builder (table not in the generated types yet). */
function topFriendsTable(): TopFriendQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => TopFriendQuery }
  return db.from('spotlight_top_friends')
}

/** Read an owner's featured friend ids in saved (position-ascending) order. */
async function readOwnerFriendIds(ownerProfileId: string): Promise<string[]> {
  const data = await new Promise<TopFriendRow[]>((resolve) => {
    topFriendsTable()
      .select('friend_profile_id, position')
      .eq('owner_profile_id', ownerProfileId)
      .order('position', { ascending: true })
      .limit(MAX_TOP_FRIENDS)
      .then((r) => resolve(r.data ?? []))
  })
  return data.map((r) => r.friend_profile_id)
}

/**
 * Replace an owner's whole Top Friends set with `rows` (delete-then-insert, so positions
 * stay dense and ordered). Owner-SCOPED: the delete binds owner_profile_id, so it can only
 * touch the caller's own grid. The action that calls this has already session-derived the
 * owner id and friendship-validated the picks.
 */
export async function rewriteTopFriends(
  ownerProfileId: string,
  rows: { owner_profile_id: string; friend_profile_id: string; position: number }[],
): Promise<{ error?: string }> {
  const delErr = await new Promise<{ message: string } | null>((resolve) => {
    topFriendsTable()
      .delete()
      .eq('owner_profile_id', ownerProfileId)
      .then((r) => resolve(r.error))
  })
  if (delErr) return { error: delErr.message }
  if (rows.length > 0) {
    const { error } = await topFriendsTable().insert(rows)
    if (error) return { error: error.message }
  }
  return {}
}

/** Delete one (owner, friend) pick. Owner-scoped delete. */
export async function deleteOneTopFriend(
  ownerProfileId: string,
  friendProfileId: string,
): Promise<{ error?: string }> {
  const err = await new Promise<{ message: string } | null>((resolve) => {
    topFriendsTable()
      .delete()
      .eq('owner_profile_id', ownerProfileId)
      .eq('friend_profile_id', friendProfileId)
      .then((r) => resolve(r.error))
  })
  return err ? { error: err.message } : {}
}

/** Read an owner's current featured friend ids (saved order). Exposed for the reorder/remove
 *  actions, which re-densify from the survivors. */
export async function getOwnerTopFriendIds(ownerProfileId: string): Promise<string[]> {
  return readOwnerFriendIds(ownerProfileId)
}

/**
 * Normalize a requested ordered list of friend profile ids into the set we will store:
 * trims to a sane size, drops blanks, removes the owner (no self-feature), and
 * de-duplicates while PRESERVING first-seen order. Pure — no IO, no friendship check
 * (the action does that against the live `friendships` graph). This is the unit-tested
 * core of `setTopFriends`.
 */
export function normalizeTopFriendIds(ownerProfileId: string, rawIds: unknown): string[] {
  if (!Array.isArray(rawIds)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of rawIds) {
    if (typeof raw !== 'string') continue
    const id = raw.trim()
    if (!id || id === ownerProfileId || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= MAX_TOP_FRIENDS) break
  }
  return out
}

/**
 * Map a normalized ordered id list to the dense, 0-based rows we persist. The order of
 * the input list IS the display order, so `position` is just the index. Pure.
 */
export function toTopFriendRows(
  ownerProfileId: string,
  orderedFriendIds: string[],
): { owner_profile_id: string; friend_profile_id: string; position: number }[] {
  return orderedFriendIds.map((friendId, i) => ({
    owner_profile_id: ownerProfileId,
    friend_profile_id: friendId,
    position: i,
  }))
}

/**
 * Read an owner's ordered Top Friends, joined to each friend's PUBLIC profile fields
 * (handle/name/avatar — the same member-safe surface as lib/spotlight/privacy.ts).
 * Reads through the admin client so the PUBLIC Spotlight page (anonymous, no RLS) and
 * the editor preview both resolve the same governed grid. Best-effort: returns [] on
 * any error or when the member has featured nobody. Drops a pick whose friend profile
 * is inactive/system/missing, so a stale row never surfaces a hidden account.
 */
export async function getTopFriendsForOwner(ownerProfileId: string): Promise<TopFriend[]> {
  if (!ownerProfileId) return []
  const admin = createAdminClient()

  // Two steps (spotlight_top_friends has two FKs to profiles — owner + friend — so we
  // resolve the ordered friend ids first, then their public fields, preserving order).
  const orderedIds = await readOwnerFriendIds(ownerProfileId)
  if (orderedIds.length === 0) return []

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, handle, display_name, avatar_url, is_active, is_system')
    .in('id', orderedIds)

  const byId = new Map<
    string,
    {
      id: string
      handle: string | null
      display_name: string | null
      avatar_url: string | null
      is_active: boolean | null
      is_system: boolean | null
    }
  >()
  for (const p of (profiles ?? []) as {
    id: string
    handle: string | null
    display_name: string | null
    avatar_url: string | null
    is_active: boolean | null
    is_system: boolean | null
  }[]) {
    byId.set(p.id, p)
  }

  // Re-apply the saved order; drop a pick whose profile is missing/inactive/system so a
  // stale row never surfaces a hidden account.
  const out: TopFriend[] = []
  for (const id of orderedIds) {
    const f = byId.get(id)
    if (!f?.handle || f.is_active === false || f.is_system === true) continue
    out.push({
      profileId: f.id,
      handle: f.handle,
      displayName: f.display_name,
      avatarUrl: f.avatar_url,
    })
  }
  return out
}

/**
 * Read every ACCEPTED friend of a member as the same TopFriend shape the grid renders
 * (public identity fields only). Powers the editor's picker source list. Drops
 * inactive/system accounts. Best-effort; returns [] on error. Reads through the admin
 * client (the editor page owns the session auth + owner-id resolution).
 */
export async function getAcceptedFriendsForPicker(ownerProfileId: string): Promise<TopFriend[]> {
  if (!ownerProfileId) return []
  const admin = createAdminClient()

  // Two steps (no ambiguous embed: friendships has two FKs to profiles). First, the
  // friend ids from the accepted edges; then their public profile fields in one .in().
  const { data: edges } = await admin
    .from('friendships')
    .select('user_a_id, user_b_id')
    .eq('status', 'accepted')
    .or(`user_a_id.eq.${ownerProfileId},user_b_id.eq.${ownerProfileId}`)

  const friendIds: string[] = []
  const seen = new Set<string>()
  for (const e of (edges ?? []) as { user_a_id: string; user_b_id: string }[]) {
    const other = e.user_a_id === ownerProfileId ? e.user_b_id : e.user_a_id
    if (other && other !== ownerProfileId && !seen.has(other)) {
      seen.add(other)
      friendIds.push(other)
    }
  }
  if (friendIds.length === 0) return []

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, handle, display_name, avatar_url, is_active, is_system')
    .in('id', friendIds)

  const rows = (profiles ?? []) as {
    id: string
    handle: string | null
    display_name: string | null
    avatar_url: string | null
    is_active: boolean | null
    is_system: boolean | null
  }[]

  const out: TopFriend[] = []
  for (const p of rows) {
    if (!p.handle || p.is_active === false || p.is_system === true) continue
    out.push({
      profileId: p.id,
      handle: p.handle,
      displayName: p.display_name,
      avatarUrl: p.avatar_url,
    })
  }
  out.sort((x, y) => (x.displayName || x.handle).localeCompare(y.displayName || y.handle))
  return out
}

/**
 * Filter a requested ordered id list down to the ids that are ACCEPTED friends of the
 * owner, in the requested order. The friendship rows are canonical (one row per pair,
 * user_a_id < user_b_id; see 20240203000000_friendships.sql), so we resolve each pick's
 * canonical pair and keep only ids with a matching accepted edge. Reads through the
 * admin client (the action owns auth). Pure-ish: the only IO is the friendship lookup.
 */
export async function keepAcceptedFriends(
  ownerProfileId: string,
  orderedFriendIds: string[],
): Promise<string[]> {
  if (orderedFriendIds.length === 0) return []
  const admin = createAdminClient()

  // One query: every accepted edge touching the owner. Then keep requested ids that
  // appear on the other side of one of those edges, in the requested order.
  const { data } = await admin
    .from('friendships')
    .select('user_a_id, user_b_id')
    .eq('status', 'accepted')
    .or(`user_a_id.eq.${ownerProfileId},user_b_id.eq.${ownerProfileId}`)

  const friendSet = new Set<string>()
  for (const edge of (data ?? []) as { user_a_id: string; user_b_id: string }[]) {
    const other = edge.user_a_id === ownerProfileId ? edge.user_b_id : edge.user_a_id
    if (other) friendSet.add(other)
  }
  return orderedFriendIds.filter((id) => friendSet.has(id))
}
