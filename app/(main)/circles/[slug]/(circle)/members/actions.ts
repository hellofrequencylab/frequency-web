'use server'

// Setting a member's circle role (ADR-1014) — the ONE write path for the ladder in
// lib/core/circle-roles.ts. There is no second one: the picker on the Members tab calls
// this, and this is the only place in the app that writes `memberships.volunteer_role`
// after a circle is created.
//
// THE GATE IS THE CAPABILITY, NOT THE UI. `circle.manageRoles` is resolved server-side
// from the live circle on every call, so hiding the picker is an affordance and this is the
// law. An Admin (`volunteer_role='guide'`) holds every other circle management capability
// and provably not this one, so an Admin cannot re-rank anybody, including themselves.
//
// THE LAST-OWNER GUARD. Ownership is `circles.host_id` and nothing else. This action never
// writes that column and refuses outright to touch the owner's membership row, so no
// sequence of calls can leave a circle with zero owners, and no other member can demote the
// owner. Passing the circle on is a transfer, a different act with a different action, and
// it is deliberately not reachable from here.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { logAdminAction } from '@/lib/admin/audit'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { CIRCLE_ROLE_STORED_VALUE, isAssignableCircleRole } from '@/lib/core/circle-roles'

/**
 * Set one member's role in one circle. Returns the plain-language outcome; the picker
 * renders it inline rather than throwing, because "you cannot change the Host's role" is an
 * answer, not a crash.
 */
export async function setCircleMemberRole(
  circleId: string,
  targetProfileId: string,
  role: string,
): Promise<ActionResult> {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return fail('Sign in to change roles.')
  if (!circleId || !targetProfileId) return fail('Missing the circle or the member.')

  // Fail closed on anything that is not one of the three assignable rungs. 'host' is not on
  // that list on purpose, so a client asking to mint an owner is rejected here.
  if (!isAssignableCircleRole(role)) return fail('That is not a role you can set.')

  const admin = createAdminClient()
  const { data: circle } = await admin
    .from('circles')
    .select('id, slug, host_id')
    .eq('id', circleId)
    .maybeSingle()
  if (!circle) return fail('Circle not found.')

  // Re-resolved per request against the live circle, never trusted from the client.
  const caps = await getCircleCapabilities(circle.id)
  if (!caps.has('circle.manageRoles')) return fail('Only the Host sets roles in this circle.')

  // THE LAST-OWNER GUARD. The owner's standing lives on circles.host_id, so a role change
  // could not actually remove it, but letting the control fire would print a demotion the
  // circle does not honour. Refuse, and say why.
  if (circle.host_id && targetProfileId === circle.host_id) {
    return fail('The Host holds the circle. Pass the circle on to change who that is.')
  }

  // TENANCY: the target must be an active member of THIS circle. Without this an id from
  // another circle would be written into this one's roster.
  const { data: membership } = await admin
    .from('memberships')
    .select('id, status')
    .eq('circle_id', circle.id)
    .eq('profile_id', targetProfileId)
    .maybeSingle()
  if (!membership || membership.status !== 'active') {
    return fail('That person is not in this circle.')
  }

  const { error } = await admin
    .from('memberships')
    .update({ volunteer_role: CIRCLE_ROLE_STORED_VALUE[role] })
    .eq('id', membership.id)
  if (error) return fail('Could not save that role. Try again.')

  await logAdminAction({
    actorId: myProfileId,
    action: 'circle.role.set',
    targetType: 'membership',
    targetId: membership.id,
    detail: { circleId: circle.id, profileId: targetProfileId, role },
  })

  revalidatePath(`/circles/${circle.slug}/members`)
  revalidatePath(`/circles/${circle.slug}`)
  return ok()
}
