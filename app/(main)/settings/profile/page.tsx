import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FocusTemplate } from '@/components/templates'
import { ProfileForm } from './profile-form'

export default async function ProfileSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, handle, bio, avatar_url, phone, city, website')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) notFound()

  return (
    <FocusTemplate
      title="Edit Profile"
      description="Update your display name, handle, photo, and personal contact info."
      back={{ href: '/settings', label: 'Settings' }}
    >
      <ProfileForm
        userId={user.id}
        initial={{
          displayName: profile.display_name ?? '',
          handle:      profile.handle ?? '',
          bio:         profile.bio ?? '',
          avatarUrl:   profile.avatar_url ?? '',
          email:       user.email ?? '',
          phone:       profile.phone ?? '',
          city:        profile.city ?? '',
          website:     profile.website ?? '',
        }}
      />
    </FocusTemplate>
  )
}
