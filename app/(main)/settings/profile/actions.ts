'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { sanitizeProfileInput } from '@/lib/profile-input'

export async function updateProfile(data: {
  displayName: string
  handle: string
  bio: string
  avatarUrl: string
  headerImageUrl?: string
  phone?: string
  city?: string
  website?: string
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
  // header_image_url isn't in the generated types yet (new column) — set via cast.
  if (data.headerImageUrl !== undefined) {
    (update as Record<string, unknown>).header_image_url = data.headerImageUrl.trim() || null
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
  revalidatePath('/crm') // contact edits reflect in the CRM
}
