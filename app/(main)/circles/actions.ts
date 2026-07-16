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
import { type ActionResult, fail } from '@/lib/action-result'
import { suggestCircleDraft, fallbackCircleSuggestion, type CircleSuggestion } from '@/lib/ai/circle-wizard'
import { recordCircleStarterMilestone } from '@/lib/beta/referral-contest'

// Vera's start-a-circle assist: suggest a name + about from the chosen Interest.
// Live (Haiku) when AI is on; a deterministic draft otherwise — so the modal's
// "Suggest" affordance always returns something the host can edit before creating.
export async function suggestCircle(
  interest: string,
  type: 'in-person' | 'online',
): Promise<CircleSuggestion> {
  const safeType: 'in-person' | 'online' = type === 'online' ? 'online' : 'in-person'
  const profileId = await getMyProfileId()
  const ai = await suggestCircleDraft({ interest, type: safeType, profileId })
  return ai ?? fallbackCircleSuggestion(interest, safeType)
}

export async function joinCircle(circleId: string, circleSlug: string): Promise<ActionResult> {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return fail('Sign in to join a circle.')

  const admin = createAdminClient()

  // Check circle capacity
  const { data: circle } = await admin
    .from('circles')
    .select('member_count, member_cap, hub_id')
    .eq('id', circleId)
    .maybeSingle()

  if (!circle) return fail('This circle is no longer available.')
  if (circle.member_count >= circle.member_cap) return fail('This circle is full.') // full

  // Nexus capacity only applies when the circle belongs to a hub → nexus. A
  // circle with no hub (a standalone / founding circle) has no nexus cap to
  // enforce, so it falls straight through to the join instead of aborting.
  if (circle.hub_id) {
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
        // Count active memberships across every circle in every hub of this nexus in a
        // SINGLE round-trip via an inner join (memberships → circles → hubs → nexus),
        // instead of the old serial N+1 (fetch hub ids, then circle ids, then count with
        // an unbounded IN(...)). Pre-check only — the F2 trigger is the hard guarantee.
        const { count } = await admin
          .from('memberships')
          .select('id, circles!inner(hubs!inner(nexus_id))', { count: 'exact', head: true })
          .eq('status', 'active')
          .eq('circles.hubs.nexus_id', hub.nexus_id)

        if ((count ?? 0) >= nexus.member_cap) return fail('This region is at capacity right now.') // nexus at capacity
      }
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
    return fail('Could not join this circle. Please try again.')
  }

  processGamificationEvent({ type: 'circle_join', profileId: myProfileId }).catch(() => {})
  awardGems(myProfileId, 'circle_join').catch(() => {})
  // Activation-funnel step 3 + the engagement funnel's join step (ADR-075). Best-effort.
  await track('circle.joined', { circleId }, myProfileId)

  // Beta referral + Circle-starter contest (phase P3): if this join pushed the Circle
  // to ten active members, credit the founder. No-op unless the contest flag is on;
  // idempotent per Circle. Awaited (best-effort) so it runs before the redirect below.
  await recordCircleStarterMilestone(circleId).catch(() => {})

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

  // Enqueue the invite email best-effort: the link is already created, so a mail hiccup
  // (a queue blip) must never fail the invite. A re-invite mints a fresh link + resends,
  // which is intended. Suppression is enforced at the outbox drain (sendRawEmail).
  try {
    await sendInviteEmail({
      to: clean,
      inviterName: me?.display_name ?? 'A member',
      contextName: circle.name,
      contextKind: 'circle',
      inviteUrl: `${SITE_URL}/join/${token}`,
    })
  } catch (e) {
    console.error('[inviteByEmail] invite email enqueue failed', e)
  }

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
