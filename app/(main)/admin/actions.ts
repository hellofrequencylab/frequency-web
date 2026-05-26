'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor'

async function getCallerRole(): Promise<CommunityRole | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  return (data?.community_role ?? null) as CommunityRole | null
}

export async function assignRole(profileId: string, role: CommunityRole) {
  const callerRole = await getCallerRole()
  if (!callerRole || !['host', 'guide', 'mentor'].includes(callerRole)) {
    throw new Error('Unauthorized')
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ community_role: role })
    .eq('id', profileId)

  if (error) throw new Error(error.message)

  revalidatePath('/admin')
}

export async function deactivateMember(profileId: string) {
  const callerRole = await getCallerRole()
  if (!callerRole || !['host', 'guide', 'mentor'].includes(callerRole)) {
    throw new Error('Unauthorized')
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ is_active: false })
    .eq('id', profileId)

  if (error) throw new Error(error.message)

  revalidatePath('/admin')
}
