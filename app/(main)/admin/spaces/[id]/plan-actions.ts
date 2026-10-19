'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { logAdminAction } from '@/lib/admin/audit'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { setSpacePlan } from '@/lib/pricing/space-plan'
import { SPACE_PLANS, SPACE_PLAN_LABEL, type SpacePlan } from '@/lib/pricing/plans'
import { parseInput, z, uuid } from '@/lib/validation'

// THE OPERATOR PLAN CONTROL (ADR-1773), behind the "Plan" section on /admin/spaces/[id]. The manual
// billing panel records the money and says "the plan itself is set separately"; until now separately
// meant SQL. This is the one console write: janitor-gated, audited (`space.plan`), and it goes through
// setSpacePlan with `force`, so the billing namespace of the Space's entitlements is set to the plan's
// exact key set the same way the Stripe webhook sets it. A Space OWNER never reaches this; the owner's
// path is checkout. No em dashes (operator copy, CONTENT-VOICE).

const ADMIN_PATH = '/admin/spaces'

/** Set a Space's plan by hand (staff). Returns ActionResult; the panel renders the error verbatim. */
export async function setSpacePlanAction(spaceId: string, plan: string, currentPlan: string | null): Promise<ActionResult> {
  const { profileId } = await requireAdmin('janitor')
  let parsed: { spaceId: string; plan: SpacePlan }
  try {
    parsed = parseInput(z.object({ spaceId: uuid, plan: z.enum(SPACE_PLANS) }), { spaceId, plan })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Pick a plan from the list.')
  }
  if (parsed.plan === currentPlan) return fail(`This space is already on ${SPACE_PLAN_LABEL[parsed.plan]}.`)

  const result = await setSpacePlan(parsed.spaceId, parsed.plan, { force: true })
  if (!result.ok) {
    return fail(result.reason === 'not_found' ? 'We could not find that space.' : 'The plan did not save. Try again, and check the Space still exists.')
  }
  await logAdminAction({
    actorId: profileId,
    action: 'space.plan',
    targetType: 'space',
    targetId: parsed.spaceId,
    detail: { from: currentPlan, to: parsed.plan },
  })
  revalidatePath(`${ADMIN_PATH}/${parsed.spaceId}`)
  revalidatePath(ADMIN_PATH)
  return ok()
}
