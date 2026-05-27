'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function toggleCrewRole() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) return { error: 'Profile not found' }

  const currentRole = profile.community_role as string

  // Only toggle between member and crew. Don't touch host+ roles.
  if (!['member', 'crew'].includes(currentRole)) {
    return { error: 'Your role is managed by community leadership' }
  }

  const newRole = currentRole === 'crew' ? 'member' : 'crew'

  const { error } = await admin
    .from('profiles')
    .update({ community_role: newRole })
    .eq('id', profile.id)

  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  return { role: newRole }
}
