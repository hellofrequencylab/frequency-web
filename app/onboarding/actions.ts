'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { sendWelcomeEmail } from '@/lib/email'
import { sanitizeProfileInput } from '@/lib/profile-input'

export async function completeOnboarding(data: {
  displayName: string
  handle: string
  bio: string
  avatarUrl: string
  regionId: string
}) {
  const { displayName, handle, bio, avatarUrl } = sanitizeProfileInput(data)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  const { error } = await supabase
    .from('profiles')
    .update({
      display_name: displayName,
      handle,
      bio: bio || null,
      avatar_url: avatarUrl || null,
      nexus_region_id: data.regionId,
      // Stamp onboarding complete so returning users bypass this flow.
      // Using jsonb_set would merge; overwriting is fine here since meta
      // starts as '{}' for all auto-created profiles.
      meta: { onboarding_completed: true },
    })
    .eq('auth_user_id', user.id)

  if (error) {
    // 23505 = unique_violation. Handle was claimed between check and submit
    if (error.code === '23505') {
      throw new Error('That handle was just taken. Go back and choose another.')
    }
    throw new Error(error.message)
  }

  // Fire welcome email. Non-blocking, never throws
  if (user.email) {
    sendWelcomeEmail({ to: user.email, displayName }).catch(() => {})
  }

  redirect('/circles')
}
