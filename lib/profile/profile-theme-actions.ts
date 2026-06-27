'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSelectableProfileSkin } from '@/lib/theme/profile-skins'
import { readSpotlightEnabled } from '@/lib/profile/spotlight-flags'

// Owner-only: set the skin that themes your profile + Spotlight page. Self-scoped —
// the write is always keyed to the caller's own auth_user_id, so it can't touch
// anyone else's row. Validates against the governed PROFILE_SKINS allowlist (no raw
// colors/CSS ever reach the column). Requires the owner's Spotlight to be enabled,
// matching where the picker is surfaced.
export async function updateProfileTheme(themeId: string): Promise<void> {
  if (!isSelectableProfileSkin(themeId)) {
    throw new Error('That theme is not available.')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles')
    .select('handle, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!me) throw new Error('Profile not found')
  if (!readSpotlightEnabled((me as { meta?: unknown }).meta)) {
    throw new Error('Your Spotlight page is not turned on yet.')
  }

  const { error } = await admin
    .from('profiles')
    .update({ profile_theme: themeId })
    .eq('auth_user_id', user.id)
  if (error) throw new Error(error.message)

  revalidatePath('/settings/profile')
  const handle = (me as { handle?: string }).handle
  if (handle) revalidatePath(`/spotlight/${handle}`)
}
