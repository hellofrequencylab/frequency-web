'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { mergeProfileMeta } from '@/lib/profiles/meta'
import { getMyProfileId } from '@/lib/auth'

/** Settings, Feed: "Show why I see things". One key merged into the member's own profiles.meta. */
export async function setFeedWhyShown(shown: boolean): Promise<{ ok: boolean }> {
  const profileId = await getMyProfileId()
  if (!profileId) return { ok: false }
  const { error } = await mergeProfileMeta(createAdminClient(), profileId, { feedWhyHidden: !shown })
  if (error) {
    console.error('[setFeedWhyShown] merge failed', { profileId, error })
    return { ok: false }
  }
  revalidatePath('/feed')
  return { ok: true }
}
