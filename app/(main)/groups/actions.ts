'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getMyProfileId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  return profile?.id ?? null
}

export async function joinGroup(groupId: string, groupSlug: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const profileId = await getMyProfileId()
  if (!profileId) redirect('/onboarding')

  const { error } = await supabase
    .from('group_memberships')
    .insert({ profile_id: profileId, group_id: groupId })

  if (error) {
    // RLS block (not Crew+), capacity exceeded, or duplicate — swallow and stay
    console.error('[joinGroup]', error.message)
    return
  }

  revalidatePath('/groups')
  redirect(`/groups/${groupSlug}`)
}

export async function leaveGroup(groupId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const profileId = await getMyProfileId()
  if (!profileId) redirect('/onboarding')

  const { error } = await supabase
    .from('group_memberships')
    .delete()
    .eq('profile_id', profileId)
    .eq('group_id', groupId)

  if (error) {
    console.error('[leaveGroup]', error.message)
    return
  }

  revalidatePath('/groups')
  redirect('/groups')
}
