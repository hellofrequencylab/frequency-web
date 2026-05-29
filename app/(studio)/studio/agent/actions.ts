'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStaffMember, atLeastStaff } from '@/lib/staff'
import { proposeWinbacks, executeAction } from '@/lib/studio/agent'

async function gate(): Promise<{ profileId: string } | null> {
  const staff = await getStaffMember()
  if (!staff || !atLeastStaff(staff.role, 'marketer')) return null
  return { profileId: staff.profileId }
}

export async function generateProposals(): Promise<void> {
  if (!(await gate())) return
  await proposeWinbacks()
  revalidatePath('/studio/agent')
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
  revalidatePath('/studio/agent')
}

export async function dismissAction(id: string): Promise<void> {
  const staff = await gate()
  if (!staff) return
  const db = createAdminClient() as unknown as SupabaseClient
  await db
    .from('agent_actions')
    .update({ status: 'dismissed', decided_by: staff.profileId, decided_at: new Date().toISOString() })
    .eq('id', id)
  revalidatePath('/studio/agent')
}
