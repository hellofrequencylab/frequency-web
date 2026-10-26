'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStaffMember, staffCanNow } from '@/lib/staff'
import { proposeWinbacks, executeAction } from '@/lib/studio/agent'
import { isOperationalWinbackPayload } from '@/lib/studio/winback'
import { proposeContentDrafts } from '@/lib/marketing/content'

async function gate(): Promise<{ profileId: string } | null> {
  const staff = await getStaffMember()
  if (!staff || !(await staffCanNow('marketing'))) return null
  return { profileId: staff.profileId }
}

export async function generateProposals(): Promise<void> {
  if (!(await gate())) return
  await proposeWinbacks()
  revalidatePath('/admin/marketing/agent')
}

export async function generateContentDrafts(): Promise<void> {
  if (!(await gate())) return
  await proposeContentDrafts()
  revalidatePath('/admin/marketing/agent')
}

export async function approveAction(id: string): Promise<void> {
  const staff = await gate()
  if (!staff) return
  const db = createAdminClient()
  const { data: proposal, error: readError } = await db.from('agent_actions').select('kind, payload').eq('id', id).maybeSingle()
  if (readError || !proposal) throw new Error('The proposal could not be reviewed.')
  if (proposal.kind === 'email_contact' && !isOperationalWinbackPayload(proposal.payload)) throw new Error('This older or edited draft needs a new human-reviewed operational template proposal.')
  const { error } = await db
    .from('agent_actions')
    .update({ status: 'approved', decided_by: staff.profileId, decided_at: new Date().toISOString() })
    .eq('id', id)
  // Bail before executing — never run the action if its approval never persisted.
  if (error) throw new Error(error.message)
  await executeAction(id) // runs through the spine
  revalidatePath('/admin/marketing/agent')
}

export async function dismissAction(id: string): Promise<void> {
  const staff = await gate()
  if (!staff) return
  const db = createAdminClient()
  const { error } = await db
    .from('agent_actions')
    .update({ status: 'dismissed', decided_by: staff.profileId, decided_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/marketing/agent')
}

/** Ephemeral operator coaching only: never writes an action, draft or recipient message. */
export async function reviewWinbackCoaching() {
  const staff = await gate()
  if (!staff) return null
  const { coachWinbackReview } = await import('@/lib/studio/winback')
  return coachWinbackReview(staff.profileId)
}
