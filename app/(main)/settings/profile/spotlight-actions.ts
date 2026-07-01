'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  readSpotlightEnabled,
  withSpotlightLayout,
  withSpotlightBackground,
  withSpotlightTheme,
  readSpotlightThemes,
  withSpotlightThemes,
  clampSpotlightThemeName,
  withSpotlightDraft,
  clearSpotlightDraft,
  MAX_SPOTLIGHT_THEMES,
  type SpotlightThemeSlot,
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

// ── Saved theme slots (create / apply / rename / delete, max 3) ────────────────────────
// A member keeps up to three of their OWN looks and switches between them. Every action is
// owner-only and SESSION-DERIVED (no target id, like the other Spotlight writes): the auth
// user id comes from the session, so a caller can only edit their own row. Each slot bundles a
// full theme + background, VALIDATED on write by withSpotlightThemes (the same allowlist the
// public renderer enforces). Requires Spotlight enabled. `crypto.randomUUID()` is available in
// the server runtime (already used by uploadSpotlightImage above).

/** Resolve the session caller's auth user + handle + meta for a Spotlight write, or an error.
 *  Auth-user-id scoped (the authz guard) and Spotlight-enabled gated, like the theme/background
 *  writers. Returns `authUserId` (the id backgrounds pin to) alongside handle + meta. */
async function getSpotlightWriteOwner(): Promise<
  { authUserId: string; handle: string | null; meta: unknown } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: me } = await supabase
    .from('profiles')
    .select('handle, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!me) return { error: 'Profile not found' }
  const row = me as { handle: string | null; meta: unknown }
  if (!readSpotlightEnabled(row.meta)) {
    return { error: 'Your Spotlight page is not turned on yet.' }
  }
  return { authUserId: user.id, handle: row.handle, meta: row.meta }
}

/** Persist a validated theme-slot list to the session owner's meta and revalidate. */
async function persistThemeSlots(
  authUserId: string,
  handle: string | null,
  meta: unknown,
  next: SpotlightThemeSlot[],
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const nextMeta = withSpotlightThemes(meta, next, authUserId)
  const { error } = await supabase
    .from('profiles')
    .update({ meta: nextMeta as never })
    .eq('auth_user_id', authUserId)
  if (error) return { error: error.message }
  revalidateSpotlight(handle)
  return {}
}

/**
 * Save the CURRENT theme + background as a named slot, or update an existing slot. Enforces the
 * max of three (a create at the cap is rejected with a plain message); the name is clamped. Both
 * theme + background are re-validated on write by withSpotlightThemes.
 */
export async function saveSpotlightThemeSlot(
  name: unknown,
  theme: unknown,
  background: unknown,
  slotId?: unknown,
): Promise<{ error?: string; id?: string }> {
  const owner = await getSpotlightWriteOwner()
  if ('error' in owner) return { error: owner.error }

  const current = readSpotlightThemes(owner.meta, owner.authUserId)
  const safeName = clampSpotlightThemeName(name)
  const safeTheme = validateSpotlightTheme(theme)
  const safeBackground = validateSpotlightBackground(background, owner.authUserId)

  const existingId = typeof slotId === 'string' && slotId.trim() ? slotId.trim() : null
  let next: SpotlightThemeSlot[]
  let id: string

  if (existingId && current.some((s) => s.id === existingId)) {
    // Update in place (keeps position).
    id = existingId
    next = current.map((s) =>
      s.id === id ? { id, name: safeName, theme: safeTheme, background: safeBackground } : s,
    )
  } else {
    // Create a new slot — enforce the cap.
    if (current.length >= MAX_SPOTLIGHT_THEMES) {
      return { error: `You can keep up to ${MAX_SPOTLIGHT_THEMES} themes. Delete one to save another.` }
    }
    id = crypto.randomUUID()
    next = [...current, { id, name: safeName, theme: safeTheme, background: safeBackground }]
  }

  const res = await persistThemeSlots(owner.authUserId, owner.handle, owner.meta, next)
  if (res.error) return { error: res.error }
  return { id }
}

/**
 * Apply a saved slot: set the CURRENT live theme + background to that slot's values (through the
 * existing theme + background writers, so the same validation + revalidation runs). Leaves the
 * saved slots untouched. Errors if the id isn't one of the member's slots.
 */
export async function applySpotlightThemeSlot(slotId: unknown): Promise<{ error?: string }> {
  const owner = await getSpotlightWriteOwner()
  if ('error' in owner) return { error: owner.error }

  const id = typeof slotId === 'string' ? slotId.trim() : ''
  const slot = readSpotlightThemes(owner.meta, owner.authUserId).find((s) => s.id === id)
  if (!slot) return { error: 'That theme is no longer saved.' }

  // Write the live theme + background in one meta update (both validated by their writers).
  const supabase = await createClient()
  const withTheme = withSpotlightTheme(owner.meta, slot.theme)
  const nextMeta = withSpotlightBackground(withTheme, slot.background)
  const { error } = await supabase
    .from('profiles')
    .update({ meta: nextMeta as never })
    .eq('auth_user_id', owner.authUserId)
  if (error) return { error: error.message }

  revalidateSpotlight(owner.handle)
  return {}
}

/** Rename a saved slot (name clamped). No-op error if the id isn't a saved slot. */
export async function renameSpotlightThemeSlot(
  slotId: unknown,
  name: unknown,
): Promise<{ error?: string }> {
  const owner = await getSpotlightWriteOwner()
  if ('error' in owner) return { error: owner.error }

  const id = typeof slotId === 'string' ? slotId.trim() : ''
  const current = readSpotlightThemes(owner.meta, owner.authUserId)
  if (!current.some((s) => s.id === id)) return { error: 'That theme is no longer saved.' }

  const safeName = clampSpotlightThemeName(name)
  const next = current.map((s) => (s.id === id ? { ...s, name: safeName } : s))
  return persistThemeSlots(owner.authUserId, owner.handle, owner.meta, next)
}

/** Delete a saved slot. */
export async function deleteSpotlightThemeSlot(slotId: unknown): Promise<{ error?: string }> {
  const owner = await getSpotlightWriteOwner()
  if ('error' in owner) return { error: owner.error }

  const id = typeof slotId === 'string' ? slotId.trim() : ''
  const current = readSpotlightThemes(owner.meta, owner.authUserId)
  const next = current.filter((s) => s.id !== id)
  if (next.length === current.length) return { error: 'That theme is no longer saved.' }
  return persistThemeSlots(owner.authUserId, owner.handle, owner.meta, next)
}

// ── Draft vs Publish (the working copy) ────────────────────────────────────────────────
// The editor autosaves into meta.spotlight.draft (never the live nodes), so edits don't hit the
// public page until a deliberate Publish promotes them. The public renderer reads ONLY the live
// nodes (layout/theme/background + published), so a draft never leaks. Owner-only + session-derived.

/**
 * Save the working DRAFT (layout + theme + background) WITHOUT touching the live/published nodes.
 * Each part is validated before persist (layout + background pinned to the owner). This is what the
 * editor's autosave (mobile onSaveDraft, desktop Save) calls.
 */
export async function saveSpotlightDraft(
  rawLayout: unknown,
  rawTheme: unknown,
  rawBackground: unknown,
): Promise<{ error?: string }> {
  const owner = await getSpotlightWriteOwner()
  if ('error' in owner) return { error: owner.error }

  const draft = {
    layout: validateSpotlightLayout(rawLayout, owner.authUserId),
    theme: validateSpotlightTheme(rawTheme),
    background: validateSpotlightBackground(rawBackground, owner.authUserId),
  }
  const supabase = await createClient()
  const nextMeta = withSpotlightDraft(owner.meta, draft)
  const { error } = await supabase
    .from('profiles')
    .update({ meta: nextMeta as never })
    .eq('auth_user_id', owner.authUserId)
  if (error) return { error: error.message }

  revalidatePath('/settings/profile/spotlight')
  return {}
}

/**
 * PUBLISH: promote the given working copy (layout + theme + background) to the LIVE nodes, mark
 * the page published, and clear the draft. Everything is validated before persist. This is the ONE
 * write that changes what the public page renders. Keeps the existing live writers' shape so the
 * public read path is unchanged.
 */
export async function publishSpotlightDraft(
  rawLayout: unknown,
  rawTheme: unknown,
  rawBackground: unknown,
): Promise<{ error?: string }> {
  const owner = await getSpotlightWriteOwner()
  if ('error' in owner) return { error: owner.error }

  const safeLayout = validateSpotlightLayout(rawLayout, owner.authUserId)
  const safeTheme = validateSpotlightTheme(rawTheme)
  const safeBackground = validateSpotlightBackground(rawBackground, owner.authUserId)

  // Promote all three live nodes, mark published, and clear the working draft — in one update.
  let nextMeta: Record<string, unknown> = withSpotlightLayout(owner.meta, safeLayout)
  nextMeta = withSpotlightTheme(nextMeta, safeTheme)
  nextMeta = withSpotlightBackground(nextMeta, safeBackground)
  nextMeta = { ...nextMeta, spotlight: { ...(nextMeta.spotlight as Record<string, unknown>), published: true } }
  nextMeta = clearSpotlightDraft(nextMeta)

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ meta: nextMeta as never })
    .eq('auth_user_id', owner.authUserId)
  if (error) return { error: error.message }

  revalidatePath('/settings/profile')
  revalidateSpotlight(owner.handle)
  return {}
}
