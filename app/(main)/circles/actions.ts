'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { processGamificationEvent } from '@/lib/achievements'
import { awardGems } from '@/lib/gems'
import { sendInviteEmail } from '@/lib/email'
import { SITE_URL } from '@/lib/site'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { track } from '@/lib/analytics/track'

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
  if (!circle.hub_id) return // no hub → no nexus capacity to check

  // Check nexus capacity
  const { data: hub } = await admin
    .from('hubs')
    .select('nexus_id')
    .eq('id', circle.hub_id)
    .maybeSingle()

  if (hub?.nexus_id) {
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

  // Use admin client. RLS only permits crew+ to self-join via policy, but new
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
  awardGems(myProfileId, 'circle_join').catch(() => {})
  // Activation-funnel step 3 + the engagement funnel's join step (ADR-075). Best-effort.
  await track('circle.joined', { circleId }, myProfileId)

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

// Invite someone to a circle by email: create a fresh invite link and send it
// through the durable email queue (the spine). Host-only.
export async function inviteByEmail(
  circleId: string,
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return { ok: false, error: 'Not signed in.' }

  const clean = email.trim().toLowerCase()
  if (!clean || !clean.includes('@')) return { ok: false, error: 'Enter a valid email address.' }

  // Same gate as the Host Tools UI: host + janitors + area guides/mentors.
  const caps = await getCircleCapabilities(circleId)
  if (!caps.has('circle.editSettings')) {
    return { ok: false, error: 'You do not manage this circle.' }
  }

  const admin = createAdminClient()
  const { data: circle } = await admin
    .from('circles')
    .select('name')
    .eq('id', circleId)
    .maybeSingle()
  if (!circle) return { ok: false, error: 'Circle not found.' }

  const { data: me } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', myProfileId)
    .maybeSingle()

  const token = randomBytes(12).toString('base64url')
  const { error } = await admin
    .from('invite_links')
    .insert({ token, circle_id: circleId, created_by: myProfileId })
  if (error) return { ok: false, error: error.message }

  await sendInviteEmail({
    to: clean,
    inviterName: me?.display_name ?? 'A member',
    circleName: circle.name,
    inviteUrl: `${SITE_URL}/join/${token}`,
  })

  return { ok: true }
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
