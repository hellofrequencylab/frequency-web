'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStaffMember, staffCan } from '@/lib/staff'

export interface RuleResult {
  ok: boolean
  error?: string
}

export async function createRule(input: {
  name: string
  triggerEvent: string
  subject: string
  body: string
}): Promise<RuleResult> {
  const staff = await getStaffMember()
  if (!staff || !staffCan(staff.role, 'marketing')) return { ok: false, error: 'Marketer access required.' }

  const name = input.name.trim()
  if (!name || !input.triggerEvent) return { ok: false, error: 'Name and trigger are required.' }

  const db = createAdminClient() as unknown as SupabaseClient
  const { error } = await db.from('automation_rules').insert({
    name,
    trigger_event: input.triggerEvent,
    action_type: 'email_actor',
    action_config: { subject: input.subject.trim(), body: input.body.trim() },
    enabled: true,
    created_by: staff.profileId,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/marketing/automations')
  return { ok: true }
}

export async function toggleRule(id: string, enabled: boolean): Promise<void> {
  const staff = await getStaffMember()
  if (!staff || !staffCan(staff.role, 'marketing')) return

  const db = createAdminClient() as unknown as SupabaseClient
  await db.from('automation_rules').update({ enabled }).eq('id', id)
  revalidatePath('/marketing/automations')
}
