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

// Save the member's Spotlight block layout. Owner-only and SESSION-DERIVED — there is
// NO target-id parameter, so a caller can only ever write their own row (mirrors
// updateProfileTheme). The layout is VALIDATED server-side before persist (the same
// allowlist the public renderer enforces on read), so nothing unsafe is ever stored.
// Requires the member's Spotlight to be enabled first.
export async function saveSpotlightLayout(rawLayout: unknown): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: me } = await admin
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
  const { error } = await admin
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

  const admin = createAdminClient()
  const { data: me } = await admin
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
  const { error } = await admin
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

  const admin = createAdminClient()
  const { data: me } = await admin
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
  const { error } = await admin
    .from('profiles')
    .update({ meta: nextMeta as never })
    .eq('auth_user_id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/settings/profile/spotlight')
  const handle = (me as { handle?: string }).handle
  if (handle) revalidatePath(`/spotlight/${handle}`)
  return {}
}
