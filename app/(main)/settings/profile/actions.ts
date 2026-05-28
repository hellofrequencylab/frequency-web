'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function updateProfile(data: {
  displayName: string
  handle: string
  bio: string
  avatarUrl: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Handle-uniqueness check spans rows the caller can't see under RLS, so it
  // needs the service role. The actual UPDATE runs under the user's session
  // so the `profiles: self update` policy enforces auth_user_id ownership.
  if (data.handle) {
    const admin = createAdminClient()
    const { data: taken } = await admin
      .from('profiles')
      .select('id')
      .eq('handle', data.handle)
      .neq('auth_user_id', user.id)
      .maybeSingle()
    if (taken) throw new Error('That handle is already taken.')
  }

  const update: Record<string, string | null> = {
    display_name: data.displayName.trim(),
    handle:       data.handle.trim(),
    bio:          data.bio.trim() || null,
  }
  if (data.avatarUrl) update.avatar_url = data.avatarUrl

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
}
