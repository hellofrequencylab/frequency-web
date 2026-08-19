'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import {
  createManualAgreement,
  recordManualPayment,
  correctPaidThrough,
  activeAgreementForSpace,
} from '@/lib/billing/manual-agreements'

// MANUAL BILLING AGREEMENT staff actions (ADR-872), behind the "Manual billing" section on
// /admin/spaces/[id]. The crew's no-SQL path for the off-Stripe deals: record a cash/check/
// transfer agreement at its locked rate, and record each renewal payment (which extends
// paid_through by one interval and re-arms the reminder ladder). Janitor-gated like the sibling
// space actions; every write funnels through lib/billing/manual-agreements.ts, which validates
// against the table's CHECKs and enforces one active agreement per Space. These actions do NOT
// touch spaces.plan: the plan column stays the access authority (set on the same admin page's
// existing controls), the agreement is the money memory.

const ADMIN_PATH = '/admin/spaces'

/** Record a new manual agreement for a Space (staff). Amount arrives in DOLLARS from the form and
 *  is stored in cents. Refuses a second active agreement (the lib pre-checks; the partial unique
 *  index settles the race). */
export async function createAgreementAction(input: {
  spaceId: string
  plan: string
  interval: string
  amountDollars: string
  method: string
  label: string
  startedAt: string
  paidThrough: string
  note: string
}): Promise<ActionResult> {
  await requireAdmin('janitor')
  const amount = Number.parseFloat(input.amountDollars)
  if (!Number.isFinite(amount) || amount < 0) return fail('Enter the amount in dollars, zero or more.')
  const result = await createManualAgreement({
    spaceId: input.spaceId,
    plan: input.plan,
    interval: input.interval,
    amountCents: Math.round(amount * 100),
    method: input.method,
    label: input.label,
    startedAt: input.startedAt,
    paidThrough: input.paidThrough,
    note: input.note,
  })
  if (!result.ok) return fail(result.error)
  revalidatePath(`${ADMIN_PATH}/${input.spaceId}`)
  return ok()
}

/** Record a renewal payment on the Space's ACTIVE agreement (staff): paid_through extends by one
 *  interval and the reminder stamps clear. The agreement is looked up fresh by space so a stale
 *  form can never pay down a different Space's deal. */
export async function recordPaymentAction(spaceId: string): Promise<ActionResult> {
  await requireAdmin('janitor')
  if (!spaceId) return fail('We could not find that space.')
  const agreement = await activeAgreementForSpace(spaceId)
  if (!agreement) return fail('That space has no active agreement.')
  const result = await recordManualPayment(agreement.id)
  if (!result.ok) return fail(result.error)
  revalidatePath(`${ADMIN_PATH}/${spaceId}`)
  return ok()
}

/** CORRECT the paid-through date on the Space's ACTIVE agreement (staff), to an explicit date.
 *
 *  The reverse gear for `recordPaymentAction` (LIVE-050). That action is extend-only, so before this
 *  existed a renewal recorded by mistake could only be undone by someone with database access. Like
 *  its sibling it looks the agreement up FRESH by space, so a stale form can never correct a
 *  different Space's deal. */
export async function correctPaidThroughAction(
  spaceId: string,
  paidThrough: string,
): Promise<ActionResult> {
  await requireAdmin('janitor')
  if (!spaceId) return fail('We could not find that space.')
  const agreement = await activeAgreementForSpace(spaceId)
  if (!agreement) return fail('That space has no active agreement.')
  const result = await correctPaidThrough(agreement.id, paidThrough)
  if (!result.ok) return fail(result.error)
  revalidatePath(`${ADMIN_PATH}/${spaceId}`)
  return ok()
}
