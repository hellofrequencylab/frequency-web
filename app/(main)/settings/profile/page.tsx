import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ProfileForm } from './profile-form'

export default async function ProfileSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, handle, bio, avatar_url')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) notFound()

  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-subtle hover:text-text mb-4">
        <ArrowLeft className="w-4 h-4" /> Settings
      </Link>
      <h1 className="text-2xl font-bold text-text mb-1">Edit Profile</h1>
      <p className="text-sm text-muted mb-8">
        Update your display name, handle, bio, and photo.
      </p>
      <ProfileForm
        userId={user.id}
        initial={{
          displayName: profile.display_name ?? '',
          handle:      profile.handle ?? '',
          bio:         profile.bio ?? '',
          avatarUrl:   profile.avatar_url ?? '',
        }}
      />
    </div>
  )
}
