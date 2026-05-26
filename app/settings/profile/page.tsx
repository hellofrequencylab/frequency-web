import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EditProfileForm from './edit-form'

export default async function EditProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/sign-in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, handle, bio, avatar_url')
    .eq('auth_user_id', user.id)
    .single()

  // No profile row means the trigger hasn't run yet — shouldn't happen in
  // practice, but guard anyway.
  if (!profile) redirect('/sign-in')

  return (
    <EditProfileForm
      userId={user.id}
      initialDisplayName={profile.display_name}
      initialHandle={profile.handle}
      initialBio={profile.bio ?? ''}
      initialAvatarUrl={profile.avatar_url ?? ''}
    />
  )
}
