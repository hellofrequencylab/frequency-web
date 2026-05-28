'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processGamificationEvent } from '@/lib/achievements'

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

  // Use admin client — RLS only permits crew+ to self-join via policy, but new
  // members (role = 'member') should be able to join circles directly.
  // Authorization is enforced above in code (capacity, auth check).
  const { error } = await admin.from('memberships').insert({
    profile_id: myProfileId,
    circle_id: circleId,
    status: 'active',
  })
  if (error) {
    console.error('[joinCircle]', error.message)
    return
  }

  processGamificationEvent({ type: 'circle_join', profileId: myProfileId }).catch(() => {})

  revalidatePath('/circles')
  revalidatePath('/feed')
  redirect(`/circles/${circleSlug}`)
}

// ── Host invite link ──────────────────────────────────────────────────────────
// Hosts can generate an invite link for their own circle without needing admin access.

export async function createHostInviteLink(circleId: string): Promise<{ token: string }> {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) throw new Error('Not authenticated')

  const admin = createAdminClient()

  // Verify the caller is the host of this circle
  const { data: circle } = await admin
    .from('circles')
    .select('host_id')
    .eq('id', circleId)
    .maybeSingle()

  if (!circle) throw new Error('Circle not found')
  if (circle.host_id !== myProfileId) throw new Error('Only the host can generate invite links')

  const token = randomBytes(12).toString('base64url')

  // Deactivate any previous active link for this circle
  await admin
    .from('invite_links')
    .update({ is_active: false })
    .eq('circle_id', circleId)
    .eq('is_active', true)

  const { error } = await admin.from('invite_links').insert({
    token,
    circle_id:  circleId,
    created_by: myProfileId,
  })
  if (error) throw new Error(error.message)

  revalidatePath(`/circles`)
  return { token }
}

export async function leaveCircle(circleId: string) {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return

  const admin = createAdminClient()
  await admin
    .from('memberships')
    .delete()
    .eq('profile_id', myProfileId)
    .eq('circle_id', circleId)

  revalidatePath('/circles')
  revalidatePath('/feed')
  redirect('/circles')
}
