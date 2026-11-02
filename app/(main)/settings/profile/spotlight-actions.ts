'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mergeProfileMeta, mergeProfileMetaPath, removeProfileMetaKeys } from '@/lib/profiles/meta'
import { readSpotlightEnabled } from '@/lib/profile/spotlight-flags'
import { validateSpotlightTheme } from '@/lib/spotlight/theme'
import { validateSpotlightBackground } from '@/lib/spotlight/blocks/validate'
import { hasNativeNodeStorage, legacySpaceLayoutWriteError } from '@/lib/entity-blocks/legacy-write-guard'
import { sanitizeNodeLayout } from '@/lib/entity-blocks/node-ops'
import { renderPathEnabled } from '@/lib/platform-flags'
import { sanitizeEntityLayout } from '@/lib/entity-blocks/layout'
import { withMemberGridLayout } from '@/lib/entity-blocks/member-grid-meta'
import { countPlacedBlocks, growsPastCap, SPOTLIGHT_BLOCKS_MESSAGE, type SpotlightCapReached } from '@/lib/spotlight/caps'
import { allowanceAt } from '@/lib/pricing/feature-meters'
import { loadCatalogConfig } from '@/lib/pricing/catalog-config'
import { memberWithinLeadershipAllowance } from '@/lib/pricing/member-leadership'
import type { EntitlementTier } from '@/lib/core/entitlement'

// PUCK RETIRED (ADR-522 follow-up). The old Puck Spotlight editor and every writer that saved the Puck
// nodes (meta.spotlight.layout / theme / background / themes / draft + publishSpotlightDraft) are gone —
// the GRID is the single engine end to end. What remains here writes what the grid engine needs:
//   • saveMemberGridLayout — the freeform ROWS the in-rail Layout builder produces (meta.entityGrid).
//   • uploadSpotlightImage — the guarded image upload (also used by the marketing linktree block).
// The public page's on/off visibility is gated by setSpotlightEnabled / setSpotlightPublished (kept in
// ./actions.ts) — those now gate the GRID's public visibility.

/** The typed signal behind a refused block-cap save. Undefined when the meter has no numeric cap to name. */
async function capReachedFor(tier: EntitlementTier, used: number): Promise<SpotlightCapReached | undefined> {
  const allowed = allowanceAt('spotlight_blocks', tier)
  const crewAllowed = allowanceAt('spotlight_blocks', 'crew')
  if (allowed == null || crewAllowed == null) return undefined
  let presetCents: number[] = []
  let suggestedCents = 0
  let minCents = 0
  try {
    const { pwyw } = await loadCatalogConfig()
    presetCents = pwyw.presetCents
    suggestedCents = pwyw.suggestedCents
    minCents = pwyw.minCents
  } catch {
    // The panel still names the cap; it points at the membership page when there are no presets to draw.
  }
  return { used, allowed, crewAllowed, presetCents, suggestedCents, minCents }
}

// ── Unified grid layout (ADR-508 U2b · ADR-516 Phase C) ────────────────────────────────────────
// Save the member's GRID layout — the freeform ROWS from the in-rail Profile page builder. Owner-only and
// SESSION-DERIVED (no target id) so a caller can only ever write their own row. The layout is SANITIZED to
// unified member block ids before persist (sanitizeEntityLayout runs sanitizeRows over any `rows` field:
// columns clamped to 1-4, cells kept only for known member blocks, deduped, unsafe row ids regenerated —
// the wire is never trusted) and stored at meta.entityGrid. This is the builder surface, so it does NOT
// require Spotlight to be enabled (the in-app profile renders it for every member).
export async function saveMemberGridLayout(rawLayout: unknown): Promise<{ error?: string; capReached?: SpotlightCapReached }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: me } = await supabase
    .from('profiles')
    .select('id, handle, meta, membership_tier')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!me) return { error: 'Profile not found' }

  const meta = (me as { meta?: unknown }).meta
  const storedGrid = meta && typeof meta === 'object' && !Array.isArray(meta)
    ? (meta as Record<string, unknown>).entityGrid
    : undefined
  // Behind render_path_space_profile (the profile surface's switch) a NATIVE node document is accepted and
  // stored as nodes; everything else keeps the LIVE-875 refusal, so a stale legacy save can never overwrite
  // stored nodes. Switched off, or on a read error, nothing changes.
  const nativeWrite = hasNativeNodeStorage(rawLayout) && (await renderPathEnabled('space_profile'))
  const compatibilityError = nativeWrite ? null : legacySpaceLayoutWriteError(rawLayout, { profileLayout: storedGrid })
  if (compatibilityError) return { error: compatibilityError }

  const safe = nativeWrite ? sanitizeNodeLayout(rawLayout, 'member') : sanitizeEntityLayout(rawLayout, 'member')

  // The block cap (the `spotlight_blocks` meter, the Spotlight split). The REAL tier decides, never the beta
  // display tier, and a layout no bigger than the saved one is always kept, so nobody is locked out of a page
  // they already built. Fail-safe to allowed while the gates are not live.
  const nextCount = countPlacedBlocks(safe)
  const savedCount = countPlacedBlocks(storedGrid)
  if (nextCount > savedCount) {
    const tier = ((me as { membership_tier?: string | null }).membership_tier ?? 'free') as EntitlementTier
    const allowed = await memberWithinLeadershipAllowance('spotlight_blocks', tier, nextCount - 1)
    if (growsPastCap(nextCount, savedCount, allowed)) {
      // The error string stays (every older caller reads it); `capReached` is what the builder draws the
      // calm upgrade panel from (SPL-11). Built from the meter and the Crew config, so nothing is typed twice.
      return { error: SPOTLIGHT_BLOCKS_MESSAGE, capReached: await capReachedFor(tier, savedCount) }
    }
  }
  // 2026-09-05 (scan2 L6-09): the helper over an EMPTY base says whether `entityGrid` is set or dropped
  // (an empty layout deletes it), and ONLY that key is merged or removed server-side. The RPC checks
  // auth.uid() owns the row, so the write stays session-scoped.
  const patch = withMemberGridLayout({}, safe)
  const profileId = (me as { id: string }).id
  const { error } = 'entityGrid' in patch
    ? await mergeProfileMeta(supabase, profileId, { entityGrid: patch.entityGrid })
    : await removeProfileMetaKeys(supabase, profileId, ['entityGrid'])
  if (error) return { error }

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

// ── Page appearance: theme + background (ADR-525) ──────────────────────────────
// The Puck Spotlight editor carried the writers for the page THEME (header framing + fonts + colours) and
// the page BACKGROUND (image + focus/dim/zoom); both were retired with it (ADR-524). These are the minimal
// owner-gated replacements the grid-side Appearance rail uses. Each writes the SAME validated meta.spotlight
// shape lib/spotlight/data.ts reads back (spotlightThemeStyles + SpotlightShell consume it), so the public
// page renders exactly as before. Owner-only + SESSION-DERIVED (the write binds to the authed user's own
// row, never a target id), VALIDATED on write (the read path re-validates on render, so this is belt-and-
// braces), and Spotlight must be enabled, matching uploadSpotlightImage and the retired writers' posture.

/**
 * Save the member's Spotlight page theme (header show/height/focusY + fonts, plus the colour/card fields).
 * The whole theme blob is coerced to the safe subset by validateSpotlightTheme, so untouched fields are
 * defaulted — the caller merges its edit over the current theme and sends the FULL object so nothing it did
 * not touch is lost. Owner-only, session-derived.
 */
export async function setSpotlightTheme(rawTheme: unknown): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: me } = await supabase
    .from('profiles')
    .select('id, handle, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!me) return { error: 'Profile not found' }
  if (!readSpotlightEnabled((me as { meta?: unknown }).meta)) {
    return { error: 'Your Spotlight page is not turned on yet.' }
  }

  const safe = validateSpotlightTheme(rawTheme)
  // 2026-09-07 (LIVE-171, ADR-1235): only `theme` is sent, merged INSIDE the `spotlight` key
  // server-side. The sibling fields (enabled, published, background) are never read and re-sent, so
  // a janitor unpublishing in the same second is not reverted by this save.
  const { error } = await mergeProfileMetaPath(supabase, (me as { id: string }).id, ['spotlight'], { theme: safe })
  if (error) return { error }

  revalidateSpotlight((me as { handle?: string | null }).handle ?? null)
  return {}
}

/**
 * Save the member's Spotlight page background (the assetPath from uploadSpotlightImage, plus focusX/focusY/
 * dim/zoom framing). validateSpotlightBackground pins the assetPath to the owner's own storage folder
 * (`<authUserId>/spotlight/…`) and clamps the framing numbers, so a tampered path or value can never reach
 * the public renderer. Owner-only, session-derived.
 */
export async function setSpotlightBackground(rawBackground: unknown): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: me } = await supabase
    .from('profiles')
    .select('id, handle, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!me) return { error: 'Profile not found' }
  if (!readSpotlightEnabled((me as { meta?: unknown }).meta)) {
    return { error: 'Your Spotlight page is not turned on yet.' }
  }

  const safe = validateSpotlightBackground(rawBackground, user.id)
  // 2026-09-07 (LIVE-171): only `background` is sent, merged INSIDE the `spotlight` key server-side.
  const { error } = await mergeProfileMetaPath(supabase, (me as { id: string }).id, ['spotlight'], { background: safe })
  if (error) return { error }

  revalidateSpotlight((me as { handle?: string | null }).handle ?? null)
  return {}
}

function revalidateSpotlight(handle: string | null) {
  if (handle) {
    revalidatePath(`/people/${handle}`)
    revalidatePath(`/spotlight/${handle}`)
  }
}
