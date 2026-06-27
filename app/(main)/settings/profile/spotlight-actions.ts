'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  readSpotlightEnabled,
  withSpotlightLayout,
} from '@/lib/profile/spotlight-flags'
import { validateSpotlightLayout } from '@/lib/spotlight/blocks/validate'

// Save the member's Spotlight block layout. Owner-only and SESSION-DERIVED — there is
// NO target-id parameter, so a caller can only ever write their own row (mirrors
// updateProfileTheme). The layout is VALIDATED server-side before persist (the same
// allowlist the public renderer enforces on read), so nothing unsafe is ever stored.
// Requires the member's Spotlight to be enabled first.
export async function saveSpotlightLayout(rawLayout: unknown): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: me } = await admin
    .from('profiles')
    .select('handle, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!me) return { error: 'Profile not found' }
  if (!readSpotlightEnabled((me as { meta?: unknown }).meta)) {
    return { error: 'Your Spotlight page is not turned on yet.' }
  }

  const safe = validateSpotlightLayout(rawLayout, user.id)
  const nextMeta = withSpotlightLayout((me as { meta?: unknown }).meta, safe)
  const { error } = await admin
    .from('profiles')
    .update({ meta: nextMeta as never })
    .eq('auth_user_id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/settings/profile/spotlight')
  const handle = (me as { handle?: string }).handle
  if (handle) revalidatePath(`/spotlight/${handle}`)
  return {}
}
