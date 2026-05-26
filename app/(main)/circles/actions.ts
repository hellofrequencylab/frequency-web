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
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  return data?.id ?? null
}

export async function joinCircle(circleId: string, circleSlug: string) {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return

  const admin = createAdminClient()

  // Check circle capacity
  const { data: circle } = await admin
    .from('circles')
    .select('member_count, member_cap, hub_id')
    .eq('id', circleId)
    .maybeSingle()

  if (!circle) return
  if (circle.member_count >= circle.member_cap) return // full

  // Check nexus capacity
  const { data: hub } = await admin
    .from('hubs')
    .select('nexus_id')
    .eq('id', circle.hub_id)
    .maybeSingle()

  if (hub) {
    const { data: nexus } = await admin
      .from('nexuses')
      .select('id, member_cap')
      .eq('id', hub.nexus_id)
      .maybeSingle()

    if (nexus) {
      // Count active memberships across all circles in all hubs in this nexus
      const { count } = await admin
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .in(
          'circle_id',
          // Subquery via admin: get circle IDs for this nexus
          (
            await admin
              .from('circles')
              .select('id')
              .in(
                'hub_id',
                (await admin.from('hubs').select('id').eq('nexus_id', hub.nexus_id)).data?.map((h) => h.id) ?? []
              )
          ).data?.map((c) => c.id) ?? []
        )

      if ((count ?? 0) >= nexus.member_cap) return // nexus at capacity
    }
  }

  const supabase = await createClient()
  await supabase.from('memberships').insert({
    profile_id: myProfileId,
    circle_id: circleId,
    status: 'active',
  })

  revalidatePath('/circles')
  revalidatePath('/feed')
  redirect(`/circles/${circleSlug}`)
}

export async function leaveCircle(circleId: string) {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return

  const supabase = await createClient()
  await supabase
    .from('memberships')
    .delete()
    .eq('profile_id', myProfileId)
    .eq('circle_id', circleId)

  revalidatePath('/circles')
  revalidatePath('/feed')
  redirect('/circles')
}
