'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
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
  const db = createAdminClient() as unknown as SupabaseClient
  await db
    .from('agent_actions')
    .update({ status: 'approved', decided_by: staff.profileId, decided_at: new Date().toISOString() })
    .eq('id', id)
  await executeAction(id) // runs through the spine
  revalidatePath('/admin/marketing/agent')
}

export async function dismissAction(id: string): Promise<void> {
  const staff = await gate()
  if (!staff) return
  const db = createAdminClient() as unknown as SupabaseClient
  await db
    .from('agent_actions')
    .update({ status: 'dismissed', decided_by: staff.profileId, decided_at: new Date().toISOString() })
    .eq('id', id)
  revalidatePath('/admin/marketing/agent')
}
