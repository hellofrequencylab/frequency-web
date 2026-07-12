'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { sanitizeProfileInput } from '@/lib/profile-input'
import { uploadProfileImage } from '@/lib/storage/profile-images'
import {
  readSpotlightEnabled,
  withSpotlightEnabled,
  withSpotlightPublished,
} from '@/lib/profile/spotlight-flags'
import { getProfileCapabilities } from '@/lib/core/load-capabilities'

// Owner-only: publish or unpublish your own Spotlight page (the public mini-site).
// Self-scoped — the read and the write both run under the caller's SESSION client, so
// the `profiles: read own` + `profiles: self update` RLS policies enforce auth_user_id
// ownership at the database (defense-in-depth: even a dropped filter can't touch another
// row). The .eq('auth_user_id') stays as the row locator. Requires the owner's Spotlight
// to be ENABLED first (an admin turns that on); publishing is the owner's explicit,
// separate act, so a page never goes public by accident. Read-modify-write of the
// isolated spotlight sub-object (withSpotlightPublished) preserves every other meta key.
export async function setSpotlightPublished(published: boolean): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: me } = await supabase
    .from('profiles')
    .select('id, handle, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!me) throw new Error('Profile not found')

  const meta = (me as { meta?: unknown }).meta
  if (!readSpotlightEnabled(meta)) {
    throw new Error('Your Spotlight page is not turned on yet.')
  }

  const nextMeta = withSpotlightPublished(meta, published)
  const { error } = await supabase
    .from('profiles')
    .update({ meta: nextMeta as never })
    .eq('auth_user_id', user.id)
  if (error) throw new Error(error.message)

  revalidatePath('/settings/profile')
  const handle = (me as { handle?: string }).handle
  if (handle) revalidatePath(`/spotlight/${handle}`)
}

// Self-serve: a Crew+ member turns their OWN Spotlight on (or off) — the switch that
// replaces the janitor-only setup gate (ADR-431). Self-scoped via the SESSION client
// (the `profiles: read own` + `profiles: self update` RLS policies enforce auth_user_id
// ownership at the DB) AND capability-checked: `spotlight.enable` is re-resolved
// server-side as the first act, so a non-Crew member can't flip it even by calling the
// action directly. Enabling only sets up the page (the owner still publishes explicitly
// via setSpotlightPublished); DISABLING also unpublishes so a turned-off page can't stay
// live at its public URL. A janitor's force-toggle (admin/members) is unchanged.
export async function setMySpotlightEnabled(enabled: boolean): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: me } = await supabase
    .from('profiles')
    .select('id, handle, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!me) throw new Error('Profile not found')

  const caps = await getProfileCapabilities((me as { id: string }).id)
  if (!caps.has('spotlight.enable')) {
    throw new Error('Spotlight is a Crew feature. Upgrade to turn yours on.')
  }

  const meta = (me as { meta?: unknown }).meta
  let nextMeta = withSpotlightEnabled(meta, enabled)
  if (!enabled) nextMeta = withSpotlightPublished(nextMeta, false)

  const { error } = await supabase
    .from('profiles')
    .update({ meta: nextMeta as never })
    .eq('auth_user_id', user.id)
  if (error) throw new Error(error.message)

  revalidatePath('/settings/profile')
  const handle = (me as { handle?: string }).handle
  if (handle) revalidatePath(`/spotlight/${handle}`)
}

// Avatar/header upload runs on the server (not the browser client) because the
// browser client often has no session under SSR-cookie auth, which makes the
// storage write run as `anon` and fail the owner-INSERT RLS policy. Here the auth
// user id is resolved from the verified session, so the write always authorizes.
export async function uploadProfileImageAction(formData: FormData): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const file = formData.get('file')
  if (!(file instanceof Blob)) throw new Error('No image provided.')
  const kind = formData.get('kind') === 'header' ? 'header' : 'avatar'
  const contentType = file.type || 'image/jpeg'
  const bytes = new Uint8Array(await file.arrayBuffer())
  return uploadProfileImage(user.id, bytes, contentType, kind)
}

export async function updateProfile(data: {
  displayName: string
  handle: string
  bio: string
  avatarUrl: string
  headerImageUrl?: string
  phone?: string
  city?: string
  website?: string
  /** A picked city also sets the member's home location (powers "near you"). */
  home?: { lat: number; lng: number; label: string } | null
}) {
  const { displayName, handle, bio, avatarUrl } = sanitizeProfileInput(data)
  const phone = (data.phone ?? '').trim().slice(0, 40)
  const city = (data.city ?? '').trim().slice(0, 120)
  const website = (data.website ?? '').trim().slice(0, 200)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Handle-uniqueness check spans rows the caller can't see under RLS, so it
  // needs the service role. The actual UPDATE runs under the user's session
  // so the `profiles: self update` policy enforces auth_user_id ownership.
  {
    const admin = createAdminClient()
    const { data: taken } = await admin
      .from('profiles')
      .select('id')
      .eq('handle', handle)
      .neq('auth_user_id', user.id)
      .maybeSingle()
    if (taken) throw new Error('That handle is already taken.')
  }

  const update: Database['public']['Tables']['profiles']['Update'] = {
    display_name: displayName,
    handle,
    bio: bio || null,
    phone: phone || null,
    city: city || null,
    website: website || null,
  }
  if (avatarUrl) update.avatar_url = avatarUrl
  // header_image_url + home_* aren't in the generated types yet — set via cast.
  if (data.headerImageUrl !== undefined) {
    (update as Record<string, unknown>).header_image_url = data.headerImageUrl.trim() || null
  }
  if (data.home && Number.isFinite(data.home.lat) && Number.isFinite(data.home.lng)) {
    const u = update as Record<string, unknown>
    u.home_lat = data.home.lat
    u.home_lng = data.home.lng
    u.home_label = data.home.label.slice(0, 160)
  }

  const { error } = await supabase
    .from('profiles')
    .update(update)
    .eq('auth_user_id', user.id)

  if (error) {
    if (error.code === '23505') throw new Error('That handle is already taken.')
    throw new Error(error.message)
  }

  revalidatePath('/settings/profile')
  revalidatePath('/feed')
  revalidatePath('/people')
  revalidatePath(`/people/${handle}`) // the member's own public profile, so a new avatar/header shows at once
  revalidatePath('/admin/growth') // contact edits reflect in the CRM tab
}
