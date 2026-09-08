'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSelectableProfileSkin, PROFILE_SKINS } from '@/lib/theme/profile-skins'
import { readSpotlightEnabled } from '@/lib/profile/spotlight-flags'
import { missingRequiredItems, requiredItemsFor } from '@/lib/spotlight/cosmetics'
import { memberHeldItems } from '@/lib/awards/holdings'

// Owner-only: set the skin that themes your profile + Spotlight page. Self-scoped —
// the write is always keyed to the caller's own auth_user_id, so it can't touch
// anyone else's row. Validates against the governed PROFILE_SKINS allowlist (no raw
// colors/CSS ever reach the column). Requires the owner's Spotlight to be enabled,
// matching where the picker is surfaced. An EARNED skin (ProfileSkin.requiredItem) is
// refused unless the member holds the item (ADR-1279) — the same gate setSpotlightStickers
// runs for an earned sticker, so a forged client cannot pick past the hidden rail button.
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
    .select('id, handle, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!me) throw new Error('Profile not found')
  if (!readSpotlightEnabled((me as { meta?: unknown }).meta)) {
    throw new Error('Your Spotlight page is not turned on yet.')
  }

  // The earned gate. Only reads the inventory when the pick needs an item (free skins cost no query).
  if (requiredItemsFor(PROFILE_SKINS, [themeId]).length > 0) {
    const held = await memberHeldItems(supabase, (me as { id: string }).id)
    if (missingRequiredItems(PROFILE_SKINS, [themeId], held).length > 0) {
      throw new Error('That skin is earned. Unlock it and it will be here.')
    }
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
