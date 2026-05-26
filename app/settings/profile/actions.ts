'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function updateProfile(data: {
  displayName: string
  handle: string
  bio: string
  avatarUrl: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: data.displayName,
      handle: data.handle,
      bio: data.bio || null,
      avatar_url: data.avatarUrl || null,
    })
    .eq('auth_user_id', user.id)

  if (error) {
    if (error.code === '23505') {
      throw new Error('That handle is already taken.')
    }
    throw new Error(error.message)
  }

  // Redirect to the (possibly renamed) public profile.
  redirect(`/people/${data.handle}`)
}
