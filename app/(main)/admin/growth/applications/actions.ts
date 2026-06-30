'use server'

// Review-queue mutations for the Growth OS application admin (Engine 3, GE3-4,
// ADR-456). Every action RE-CHECKS the members capability server-side (the page gate
// is UX only; the admin client bypasses RLS, so the action is the authority). The
// accept-side handoff (grant host + hand off a Starter Circle) lives in the lib
// (lib/applications/handoff.ts) so there is one promotion path.
//
// Capability axis: 'members' (deciding who gets in is a member-management act).
// Marketing/operations staff who manage growth funnels also tend to hold members
// read; the accept/decline is the members WRITE gate.

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { isStaff } from '@/lib/core/roles'
import { getStaffMember, staffCan } from '@/lib/staff'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { decideApplication, markInReview } from '@/lib/applications/handoff'
import type { ApplicationHandoff } from '@/lib/applications/store'

/** Members-capability gate (the axis for deciding who gets in). Returns the caller
 *  id or a human-readable error. */
async function requireReviewer(): Promise<{ id: string } | string> {
  const me = await getCallerProfile()
  if (!me) return 'Sign in first.'
  if (isStaff(me.webRole)) return { id: me.id }
  const staff = await getStaffMember().catch(() => null)
  if (staff && staffCan(staff.role, 'members', 'write')) return { id: me.id }
  return 'Member-management access required.'
}

function refresh(id: string) {
  revalidatePath('/admin/growth/applications')
  revalidatePath(`/admin/growth/applications/${id}`)
}

/** Claim a pending application into review. */
export async function claimApplication(id: string): Promise<ActionResult> {
  const who = await requireReviewer()
  if (typeof who === 'string') return fail(who)
  if (!id) return fail('Missing application.')
  await markInReview(id, who.id)
  refresh(id)
  return ok()
}

export interface DecideActionInput {
  id: string
  /** Required on a host accept (which Starter Circle to hand off); optional otherwise. */
  starterTemplateId?: string | null
  reason?: string | null
}

/** Accept an application: records the decision and runs the accept-side handoff
 *  (host accept grants the host role + hands off a Starter Circle draft). Idempotent. */
export async function acceptApplication(
  input: DecideActionInput,
): Promise<ActionResult<{ handoff: ApplicationHandoff | null }>> {
  const who = await requireReviewer()
  if (typeof who === 'string') return fail(who)
  if (!input.id) return fail('Missing application.')

  try {
    const res = await decideApplication(
      {
        applicationId: input.id,
        reviewerProfileId: who.id,
        starterTemplateId: input.starterTemplateId ?? null,
        reason: input.reason ?? null,
      },
      true,
    )
    refresh(input.id)
    return ok({ handoff: res.handoff })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not accept the application.')
  }
}

/** Decline an application with an optional one-line reason. Idempotent. */
export async function declineApplication(input: DecideActionInput): Promise<ActionResult> {
  const who = await requireReviewer()
  if (typeof who === 'string') return fail(who)
  if (!input.id) return fail('Missing application.')

  try {
    await decideApplication(
      { applicationId: input.id, reviewerProfileId: who.id, reason: input.reason ?? null },
      false,
    )
    refresh(input.id)
    return ok()
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not decline the application.')
  }
}
