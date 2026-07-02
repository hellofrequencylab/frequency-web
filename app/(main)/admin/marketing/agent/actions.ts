'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStaffMember, staffCan } from '@/lib/staff'
import { proposeWinbacks, executeAction } from '@/lib/studio/agent'
import { proposeContentDrafts } from '@/lib/marketing/content'

async function gate(): Promise<{ profileId: string } | null> {
  const staff = await getStaffMember()
  if (!staff || !staffCan(staff.role, 'marketing')) return null
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
