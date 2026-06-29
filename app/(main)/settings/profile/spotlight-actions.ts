'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  readSpotlightEnabled,
  withSpotlightLayout,
  withSpotlightBackground,
  withSpotlightTheme,
} from '@/lib/profile/spotlight-flags'
import {
  validateSpotlightLayout,
  validateSpotlightBackground,
} from '@/lib/spotlight/blocks/validate'
import { validateSpotlightTheme } from '@/lib/spotlight/theme'
import {
  normalizeTopFriendIds,
  keepAcceptedFriends,
  toTopFriendRows,
  rewriteTopFriends,
  deleteOneTopFriend,
  getOwnerTopFriendIds,
} from '@/lib/spotlight/top-friends'

// Save the member's Spotlight block layout. Owner-only and SESSION-DERIVED — there is
// NO target-id parameter, so a caller can only ever write their own row (mirrors
// updateProfileTheme). The layout is VALIDATED server-side before persist (the same
// allowlist the public renderer enforces on read), so nothing unsafe is ever stored.
// Requires the member's Spotlight to be enabled first.
export async function saveSpotlightLayout(rawLayout: unknown): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: me } = await supabase
    .from('profiles')
    .select('handle, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!me) return { error: 'Profile not found' }
  if (!readSpotlightEnabled((me as { meta?: unknown }).meta)) {
    return { error: 'Your Spotlight page is not turned on yet.' }
  }

  const safe = validateSpotlightLayout(rawLayout, user.id)
  const nextMeta = withSpotlightLayout((me as { meta?: unknown }).meta, safe)
  const { error } = await supabase
    .from('profiles')
    .update({ meta: nextMeta as never })
    .eq('auth_user_id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/settings/profile/spotlight')
  const handle = (me as { handle?: string }).handle
  if (handle) revalidatePath(`/spotlight/${handle}`)
  return {}
}

// Image + GIF + background uploads for the Spotlight page (round 2). The schema,
// validator, and renderer already accept image blocks and a background; this is the
// guarded upload that produces the only asset paths they will ever accept.

const SPOTLIGHT_MAX_BYTES = 5 * 1024 * 1024 // 5 MB — matches the avatars bucket file_size_limit
const SPOTLIGHT_EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

// Upload one image/GIF for a Spotlight image block or background. Owner-only and
// SESSION-DERIVED — the file lands at `<authUserId>/spotlight/<uuid>.<ext>`, the ONLY
// shape `safeAssetPath` accepts on render, so a member can never write into (or point a
// block at) anyone else's namespace. A fresh uuid per upload means a replaced image gets
// a new URL (no stale CDN cache). Writes go through the service-role admin client because
// the browser client has no session under SSR-cookie auth (the silent-anon-upload bug that
// dropped a real member's avatar — see lib/storage/profile-images.ts). Returns the storage
// PATH (never a URL); the editor stores it on the block/background, then saves through the
// validator. Requires Spotlight enabled.
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

// Save the Spotlight background image + dim. Owner-only and SESSION-DERIVED (no target
// id, like saveSpotlightLayout). VALIDATED before persist — the dim is clamped and the
// asset path is pinned to the owner's own folder, so nothing unsafe is ever stored.
export async function saveSpotlightBackground(
  rawBackground: unknown,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: me } = await supabase
    .from('profiles')
    .select('handle, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!me) return { error: 'Profile not found' }
  if (!readSpotlightEnabled((me as { meta?: unknown }).meta)) {
    return { error: 'Your Spotlight page is not turned on yet.' }
  }

  const safe = validateSpotlightBackground(rawBackground, user.id)
  const nextMeta = withSpotlightBackground((me as { meta?: unknown }).meta, safe)
  const { error } = await supabase
    .from('profiles')
    .update({ meta: nextMeta as never })
    .eq('auth_user_id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/settings/profile/spotlight')
  const handle = (me as { handle?: string }).handle
  if (handle) revalidatePath(`/spotlight/${handle}`)
  return {}
}

// Save the custom Spotlight theme (colours, gradient, fonts, card style). Owner-only and
// SESSION-DERIVED (no target id). VALIDATED before persist — colours are strict hex, the
// gradient is rebuilt from validated stops on render, fonts/card are closed allowlists, so
// no raw CSS is ever stored or rendered.
export async function saveSpotlightTheme(rawTheme: unknown): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: me } = await supabase
    .from('profiles')
    .select('handle, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!me) return { error: 'Profile not found' }
  if (!readSpotlightEnabled((me as { meta?: unknown }).meta)) {
    return { error: 'Your Spotlight page is not turned on yet.' }
  }

  const safe = validateSpotlightTheme(rawTheme)
  const nextMeta = withSpotlightTheme((me as { meta?: unknown }).meta, safe)
  const { error } = await supabase
    .from('profiles')
    .update({ meta: nextMeta as never })
    .eq('auth_user_id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/settings/profile/spotlight')
  const handle = (me as { handle?: string }).handle
  if (handle) revalidatePath(`/spotlight/${handle}`)
  return {}
}

// ── Top Friends (the "Top 8") ────────────────────────────────────────────────
// A member features an ordered set of friends in a grid on their Spotlight. Unlike
// the JSON blocks, the picks live in the spotlight_top_friends table (FK to profiles)
// — these actions own auth + the friendship check + the writes. All three are
// owner-only and SESSION-DERIVED: the owner profile id comes from the session, never a
// parameter, so a caller can only ever edit their own grid. Each pick is re-validated
// against the live `friendships` graph before it is stored (no client trust). Requires
// Spotlight enabled, like the other Spotlight writes.

/** Resolve the session caller's own profile id + handle + meta, or an error. The owner
 *  id is session-derived (the authz guard), so writes can't target another member. */
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
  revalidatePath('/settings/profile/spotlight')
  if (handle) revalidatePath(`/spotlight/${handle}`)
}

/**
 * Replace the caller's Top Friends with an ordered list of friend profile ids. The list
 * is normalized (deduped, self-removed, capped at the Top 8) then filtered to ONLY
 * accepted friends — any id that isn't a real friend is silently dropped, never stored.
 * The whole set is rewritten (delete-then-insert) so positions stay dense and ordered
 * exactly as requested.
 */
export async function setTopFriends(
  rawFriendIds: unknown,
): Promise<{ error?: string; count?: number }> {
  const owner = await getSpotlightOwner()
  if ('error' in owner) return { error: owner.error }

  // Normalize (dedupe/self-remove/cap), then keep ONLY accepted friends — any id that
  // isn't a real friend of the session owner is dropped here, never stored.
  const requested = normalizeTopFriendIds(owner.id, rawFriendIds)
  const accepted = await keepAcceptedFriends(owner.id, requested)
  const rows = toTopFriendRows(owner.id, accepted)

  const res = await rewriteTopFriends(owner.id, rows)
  if (res.error) return { error: res.error }

  revalidateSpotlight(owner.handle)
  return { count: rows.length }
}

/**
 * Reorder the caller's existing Top Friends to the given id order. Only ids the member
 * has ALREADY featured are repositioned (it never adds picks); unknown ids are ignored
 * and any featured friend left out keeps its relative order at the end. Re-checks
 * friendship so a pick that lapsed since it was added is dropped here too.
 */
export async function reorderTopFriends(
  rawOrderedIds: unknown,
): Promise<{ error?: string; count?: number }> {
  const owner = await getSpotlightOwner()
  if ('error' in owner) return { error: owner.error }

  const current = await getOwnerTopFriendIds(owner.id)
  const currentSet = new Set(current)

  // Requested order, restricted to already-featured friends; then append any featured
  // friend the caller left out, preserving their existing relative order (stable).
  const wanted = normalizeTopFriendIds(owner.id, rawOrderedIds).filter((id) =>
    currentSet.has(id),
  )
  const wantedSet = new Set(wanted)
  const finalOrder = [...wanted, ...current.filter((id) => !wantedSet.has(id))]

  // Re-validate friendship (a lapsed friend drops out on reorder too).
  const accepted = await keepAcceptedFriends(owner.id, finalOrder)
  const rows = toTopFriendRows(owner.id, accepted)

  const res = await rewriteTopFriends(owner.id, rows)
  if (res.error) return { error: res.error }

  revalidateSpotlight(owner.handle)
  return { count: rows.length }
}

/**
 * Remove one friend from the caller's Top Friends and close the gap so positions stay
 * dense (0..n-1). Owner-scoped: the delete binds owner_profile_id to the session owner,
 * so it can only ever touch the caller's own grid.
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

  // Re-densify positions from the survivors' current order (0..n-1).
  const orderedIds = await getOwnerTopFriendIds(owner.id)
  const rows = toTopFriendRows(owner.id, orderedIds)
  const res = await rewriteTopFriends(owner.id, rows)
  if (res.error) return { error: res.error }

  revalidateSpotlight(owner.handle)
  return { count: rows.length }
}
