'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { endSeasonNow } from '@/lib/seasons'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// End the current season now. Destructive + global (mints trophies, converts
// zaps to gems, resets ranks/streaks/challenges, opens the next season), so
// janitor-only.
export async function endSeasonAction(): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('Not signed in')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (profile?.community_role !== 'janitor') return fail('Janitor only')

  await endSeasonNow()
  revalidatePath('/admin/gamification')
  return ok()
}
