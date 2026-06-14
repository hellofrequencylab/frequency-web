'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStaffMember, staffCan } from '@/lib/staff'
import { isAutomationActionType, type AutomationActionType } from '@/lib/automations'

export interface RuleResult {
  ok: boolean
  error?: string
}

export interface CreateRuleInput {
  name: string
  triggerEvent: string
  actionType: AutomationActionType
  // Email fields
  subject?: string
  body?: string
  // Push fields
  pushTitle?: string
  pushBody?: string
  pushUrl?: string
}

export async function createRule(input: CreateRuleInput): Promise<RuleResult> {
  const staff = await getStaffMember()
  if (!staff || !staffCan(staff.role, 'marketing')) return { ok: false, error: 'Marketer access required.' }

  const name = input.name.trim()
  if (!name || !input.triggerEvent) return { ok: false, error: 'Name and trigger are required.' }
  if (!isAutomationActionType(input.actionType)) return { ok: false, error: 'Pick a valid channel.' }

  let actionConfig: Record<string, string>
  if (input.actionType === 'push_actor') {
    const title = (input.pushTitle ?? '').trim()
    const body = (input.pushBody ?? '').trim()
    if (!title || !body) return { ok: false, error: 'Push title and body are required.' }
    const url = (input.pushUrl ?? '').trim()
    actionConfig = url ? { title, body, url } : { title, body }
  } else {
    actionConfig = { subject: (input.subject ?? '').trim(), body: (input.body ?? '').trim() }
  }

  const db = createAdminClient()
  const { error } = await db.from('automation_rules').insert({
    name,
    trigger_event: input.triggerEvent,
    action_type: input.actionType,
    action_config: actionConfig,
    enabled: true,
    created_by: staff.profileId,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/marketing/automations')
  return { ok: true }
}

export async function toggleRule(id: string, enabled: boolean): Promise<void> {
  const staff = await getStaffMember()
  if (!staff || !staffCan(staff.role, 'marketing')) return

  const db = createAdminClient()
  await db.from('automation_rules').update({ enabled }).eq('id', id)
  revalidatePath('/admin/marketing/automations')
}
