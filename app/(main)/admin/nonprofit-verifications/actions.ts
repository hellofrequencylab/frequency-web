'use server'

// Review-queue mutations for the Non Profit (501(c)(3)) verification admin (ADR-552, AUDIT #6). Every
// action RE-CHECKS the platform staff axis server-side (the page gate is UX only; the admin client
// bypasses RLS, so the action is the authority). Approval grants the discounted Non Profit plan through
// the existing plan-set path (setSpacePlan) inside the lib; rejection stores a reason. The gate matches
// the billing-adjacent admin surfaces (Pricing / Payments): platform staff only (janitor axis).

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { isJanitor } from '@/lib/core/roles'
import { fail, type ActionResult } from '@/lib/action-result'
import { approveVerification, rejectVerification } from '@/lib/spaces/nonprofit-verification'
import { parseInput, z, uuid, requiredText } from '@/lib/validation'

/** Platform-staff (janitor axis) gate, matching /admin/pricing + /admin/payments. Returns the caller id
 *  or a human-readable error. */
async function requireReviewer(): Promise<{ id: string } | string> {
  const me = await getCallerProfile()
  if (!me) return 'Sign in first.'
  if (isJanitor(me.webRole)) return { id: me.id }
  return 'Platform staff access required.'
}

/** Approve a verification: marks it verified and grants the Non Profit plan (setSpacePlan). */
export async function approveNonprofitVerification(id: string): Promise<ActionResult> {
  const who = await requireReviewer()
  if (typeof who === 'string') return fail(who)
  let parsed: { id: string }
  try {
    parsed = parseInput(z.object({ id: uuid }), { id })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Invalid input')
  }
  const res = await approveVerification(parsed.id, who.id)
  revalidatePath('/admin/nonprofit-verifications')
  return res
}

/** Reject a verification with a required reason (shown to the owner). */
export async function rejectNonprofitVerification(id: string, note: string): Promise<ActionResult> {
  const who = await requireReviewer()
  if (typeof who === 'string') return fail(who)
  let parsed: { id: string; note: string }
  try {
    parsed = parseInput(z.object({ id: uuid, note: requiredText('A reason is required') }), { id, note })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Invalid input')
  }
  const res = await rejectVerification(parsed.id, who.id, parsed.note)
  revalidatePath('/admin/nonprofit-verifications')
  return res
}
