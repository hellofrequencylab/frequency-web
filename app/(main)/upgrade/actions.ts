'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { type ActionResult, ok, fail } from '@/lib/action-result'

export async function toggleCrewRole(): Promise<ActionResult<{ role: string }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Not signed in')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) return fail('Profile not found')

  const currentRole = profile.community_role as string

  // Only toggle between member and crew. Don't touch host+ roles.
  if (!['member', 'crew'].includes(currentRole)) {
    return fail('Your role is managed by community leadership')
  }

  const newRole = currentRole === 'crew' ? 'member' : 'crew'

  const { error } = await admin
    .from('profiles')
    .update({ community_role: newRole })
    .eq('id', profile.id)

  if (error) return fail(error.message)

  revalidatePath('/', 'layout')
  return ok({ role: newRole })
}
