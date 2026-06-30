'use server'

import { revalidatePath } from 'next/cache'
import { getStaffMember, staffCan } from '@/lib/staff'
import { requeueDeadLettered } from '@/lib/queue/outbox'

export interface RequeueResult {
  ok: boolean
  revived?: number
  error?: string
}

// Recover dead-lettered outbox jobs (GE6-1). Re-gated server-side: the admin client
// bypasses RLS, so this re-runs the same marketing-domain staff check the page uses
// before reviving anything. `kind` narrows the recovery to one job type (e.g. only
// 'email' after a Resend outage); omit it to requeue every dead-letter.
export async function requeueDeadLetters(kind?: string): Promise<RequeueResult> {
  const staff = await getStaffMember()
  if (!staff || !staffCan(staff.role, 'marketing')) {
    return { ok: false, error: 'Marketer access required.' }
  }
  try {
    const revived = await requeueDeadLettered({ kind, limit: 500 })
    revalidatePath('/admin/marketing/deliverability')
    return { ok: true, revived }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not requeue jobs.' }
  }
}
