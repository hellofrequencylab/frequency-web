import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
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

  // header_image_url isn't in the generated types yet (new column) — read via cast.
  const { data: hdr } = await (supabase as unknown as SupabaseClient)
    .from('profiles')
    .select('header_image_url')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const headerImageUrl = (hdr as { header_image_url?: string | null } | null)?.header_image_url ?? ''

  return (
    <FocusTemplate
      title="Edit Profile"
      description="Update your display name, handle, photo, and personal contact info."
      back={{ href: '/settings', label: 'Settings' }}
      actions={
        profile.handle ? (
          <Link
            href={`/people/${profile.handle}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated"
          >
            <ExternalLink className="h-3.5 w-3.5" /> View profile
          </Link>
        ) : undefined
      }
    >
      <ProfileForm
        userId={user.id}
        initial={{
          displayName: profile.display_name ?? '',
          handle:      profile.handle ?? '',
          bio:         profile.bio ?? '',
          avatarUrl:   profile.avatar_url ?? '',
          headerImageUrl,
          email:       user.email ?? '',
          phone:       profile.phone ?? '',
          city:        profile.city ?? '',
          website:     profile.website ?? '',
        }}
      />
    </FocusTemplate>
  )
}
