'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readSpotlightEnabled } from '@/lib/profile/spotlight-flags'
import {
  normalizeTopFriendIds,
  keepAcceptedFriends,
  toTopFriendRows,
  rewriteTopFriends,
  deleteOneTopFriend,
  getOwnerTopFriendIds,
} from '@/lib/spotlight/top-friends'
import { sanitizeEntityLayout } from '@/lib/entity-blocks/layout'
import { withMemberGridLayout } from '@/lib/entity-blocks/member-grid-meta'

// PUCK RETIRED (ADR-522 follow-up). The old Puck Spotlight editor and every writer that saved the Puck
// nodes (meta.spotlight.layout / theme / background / themes / draft + publishSpotlightDraft) are gone —
// the GRID is the single engine end to end. What remains here writes what the grid engine needs:
//   • saveMemberGridLayout — the freeform ROWS the in-rail Layout builder produces (meta.entityGrid).
//   • uploadSpotlightImage — the guarded image upload (also used by the marketing linktree block).
//   • Top Friends (setTopFriends / reorderTopFriends / removeTopFriend) — the spotlight_top_friends TABLE
//     the `topfriends` grid block still renders from.
// The public page's on/off visibility is gated by setSpotlightEnabled / setSpotlightPublished (kept in
// ./actions.ts) — those now gate the GRID's public visibility.

// ── Unified grid layout (ADR-508 U2b · ADR-516 Phase C) ────────────────────────────────────────
// Save the member's GRID layout — the freeform ROWS from the in-rail Profile page builder. Owner-only and
// SESSION-DERIVED (no target id) so a caller can only ever write their own row. The layout is SANITIZED to
// unified member block ids before persist (sanitizeEntityLayout runs sanitizeRows over any `rows` field:
// columns clamped to 1-4, cells kept only for known member blocks, deduped, unsafe row ids regenerated —
// the wire is never trusted) and stored at meta.entityGrid. This is the builder surface, so it does NOT
// require Spotlight to be enabled (the in-app profile renders it for every member).
export async function saveMemberGridLayout(rawLayout: unknown): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: me } = await supabase
    .from('profiles')
    .select('handle, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!me) return { error: 'Profile not found' }

  const safe = sanitizeEntityLayout(rawLayout, 'member')
  const nextMeta = withMemberGridLayout((me as { meta?: unknown }).meta, safe)
  const { error } = await supabase
    .from('profiles')
    .update({ meta: nextMeta as never })
    .eq('auth_user_id', user.id)
  if (error) return { error: error.message }

  // The builder lives inline on the member's own profile (/people/<handle>), so revalidate THERE so the
  // server-rendered layout reconciles on the member's next visit (the live preview already repaints from
  // context during the session). The public mini-site reads the same grid, so revalidate it too.
  const handle = (me as { handle?: string }).handle
  if (handle) {
    revalidatePath(`/people/${handle}`)
    revalidatePath(`/spotlight/${handle}`)
  }
  return {}
}

// Image + GIF uploads for a member block (image/gallery) or the marketing linktree block. The schema,
// validator, and renderer already accept image blocks; this is the guarded upload that produces the only
// asset paths they will ever accept.

const SPOTLIGHT_MAX_BYTES = 5 * 1024 * 1024 // 5 MB — matches the avatars bucket file_size_limit
const SPOTLIGHT_EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

// Upload one image/GIF for a Spotlight image block. Owner-only and SESSION-DERIVED — the file lands at
// `<authUserId>/spotlight/<uuid>.<ext>`, the ONLY shape `safeAssetPath` accepts on render, so a member can
// never write into (or point a block at) anyone else's namespace. A fresh uuid per upload means a replaced
// image gets a new URL (no stale CDN cache). Writes go through the service-role admin client because the
// browser client has no session under SSR-cookie auth. Returns the storage PATH (never a URL). Requires
// Spotlight enabled.
export async function uploadSpotlightImage(
  formData: FormData,
): Promise<{ path?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles')
    .select('meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!me) return { error: 'Profile not found' }
  if (!readSpotlightEnabled((me as { meta?: unknown }).meta)) {
    return { error: 'Your Spotlight page is not turned on yet.' }
  }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No image chosen.' }
  if (file.size > SPOTLIGHT_MAX_BYTES) {
    return { error: `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.` }
  }
  const ext = SPOTLIGHT_EXT_BY_TYPE[file.type]
  if (!ext) return { error: 'Unsupported image type. Use JPEG, PNG, GIF, or WebP.' }

  const path = `${user.id}/spotlight/${crypto.randomUUID()}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { error } = await admin.storage
    .from('avatars')
    .upload(path, bytes, { contentType: file.type, upsert: false })
  if (error) return { error: error.message }

  return { path }
}

// ── Top Friends (the "Top 8") ────────────────────────────────────────────────
// A member features an ordered set of friends in a grid on their profile. The picks live in the
// spotlight_top_friends table (FK to profiles) — these actions own auth + the friendship check + the
// writes. All three are owner-only and SESSION-DERIVED: the owner profile id comes from the session, never
// a parameter, so a caller can only ever edit their own grid. Each pick is re-validated against the live
// `friendships` graph before it is stored (no client trust). Requires Spotlight enabled.

/** Resolve the session caller's own profile id + handle + meta, or an error. The owner id is
 *  session-derived (the authz guard), so writes can't target another member. */
async function getSpotlightOwner(): Promise<
  { id: string; handle: string | null; meta: unknown } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: me } = await supabase
    .from('profiles')
    .select('id, handle, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!me) return { error: 'Profile not found' }
  const row = me as { id: string; handle: string | null; meta: unknown }
  if (!readSpotlightEnabled(row.meta)) {
    return { error: 'Your Spotlight page is not turned on yet.' }
  }
  return row
}

function revalidateSpotlight(handle: string | null) {
  if (handle) {
    revalidatePath(`/people/${handle}`)
    revalidatePath(`/spotlight/${handle}`)
  }
}

/**
 * Replace the caller's Top Friends with an ordered list of friend profile ids. The list is normalized
 * (deduped, self-removed, capped at the Top 8) then filtered to ONLY accepted friends — any id that isn't
 * a real friend is silently dropped, never stored. The whole set is rewritten (delete-then-insert) so
 * positions stay dense and ordered exactly as requested.
 */
export async function setTopFriends(
  rawFriendIds: unknown,
): Promise<{ error?: string; count?: number }> {
  const owner = await getSpotlightOwner()
  if ('error' in owner) return { error: owner.error }

  const requested = normalizeTopFriendIds(owner.id, rawFriendIds)
  const accepted = await keepAcceptedFriends(owner.id, requested)
  const rows = toTopFriendRows(owner.id, accepted)

  const res = await rewriteTopFriends(owner.id, rows)
  if (res.error) return { error: res.error }

  revalidateSpotlight(owner.handle)
  return { count: rows.length }
}

/**
 * Reorder the caller's existing Top Friends to the given id order. Only ids the member has ALREADY
 * featured are repositioned (it never adds picks); unknown ids are ignored and any featured friend left
 * out keeps its relative order at the end. Re-checks friendship so a pick that lapsed is dropped here too.
 */
export async function reorderTopFriends(
  rawOrderedIds: unknown,
): Promise<{ error?: string; count?: number }> {
  const owner = await getSpotlightOwner()
  if ('error' in owner) return { error: owner.error }

  const current = await getOwnerTopFriendIds(owner.id)
  const currentSet = new Set(current)

  const wanted = normalizeTopFriendIds(owner.id, rawOrderedIds).filter((id) =>
    currentSet.has(id),
  )
  const wantedSet = new Set(wanted)
  const finalOrder = [...wanted, ...current.filter((id) => !wantedSet.has(id))]

  const accepted = await keepAcceptedFriends(owner.id, finalOrder)
  const rows = toTopFriendRows(owner.id, accepted)

  const res = await rewriteTopFriends(owner.id, rows)
  if (res.error) return { error: res.error }

  revalidateSpotlight(owner.handle)
  return { count: rows.length }
}

/**
 * Remove one friend from the caller's Top Friends and close the gap so positions stay dense (0..n-1).
 * Owner-scoped: the delete binds owner_profile_id to the session owner, so it can only ever touch the
 * caller's own grid.
 */
export async function removeTopFriend(
  friendProfileId: unknown,
): Promise<{ error?: string; count?: number }> {
  const owner = await getSpotlightOwner()
  if ('error' in owner) return { error: owner.error }
  if (typeof friendProfileId !== 'string' || !friendProfileId.trim()) {
    return { error: 'No friend specified.' }
  }

  const delRes = await deleteOneTopFriend(owner.id, friendProfileId.trim())
  if (delRes.error) return { error: delRes.error }

  const orderedIds = await getOwnerTopFriendIds(owner.id)
  const rows = toTopFriendRows(owner.id, orderedIds)
  const res = await rewriteTopFriends(owner.id, rows)
  if (res.error) return { error: res.error }

  revalidateSpotlight(owner.handle)
  return { count: rows.length }
}
