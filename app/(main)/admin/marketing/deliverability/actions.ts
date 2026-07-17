'use server'

import { revalidatePath } from 'next/cache'
import { getStaffMember, staffCan } from '@/lib/staff'
import { requeueDeadLettered, discardDeadLettered } from '@/lib/queue/outbox'

export interface RequeueResult {
  ok: boolean
  revived?: number
  error?: string
}

export interface DiscardResult {
  ok: boolean
  discarded?: number
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

// Discard dead-lettered jobs an operator has consciously abandoned (a poison payload that will never
// succeed on retry). Same marketing-domain staff gate as requeue. `kind` narrows it to one job type;
// omit it to discard every dead-letter. Terminal: the row moves out of the recovery queue and the drain.
export async function discardDeadLetters(kind?: string): Promise<DiscardResult> {
  const staff = await getStaffMember()
  if (!staff || !staffCan(staff.role, 'marketing')) {
    return { ok: false, error: 'Marketer access required.' }
  }
  try {
    const discarded = await discardDeadLettered({ kind, limit: 500 })
    revalidatePath('/admin/marketing/deliverability')
    return { ok: true, discarded }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not discard jobs.' }
  }
}
