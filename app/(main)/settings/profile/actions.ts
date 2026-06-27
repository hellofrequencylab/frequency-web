'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { sanitizeProfileInput } from '@/lib/profile-input'
import { uploadProfileImage } from '@/lib/storage/profile-images'

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
  revalidatePath('/admin/growth') // contact edits reflect in the CRM tab
}
