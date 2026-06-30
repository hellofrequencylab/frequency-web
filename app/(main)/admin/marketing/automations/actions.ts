'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStaffMember, staffCan } from '@/lib/staff'
import {
  isAutomationActionType,
  parseConditions,
  type AutomationActionType,
  type AutomationCondition,
} from '@/lib/automations'
import type { Json } from '@/lib/database.types'

export interface RuleResult {
  ok: boolean
  error?: string
}

export interface RuleInput {
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
  // Condition layer (trigger → CONDITION → action). Matched against the event context.
  conditions?: AutomationCondition[]
}

// Back-compat alias for the create form's prop type.
export type CreateRuleInput = RuleInput

// The single write gate, re-checked server-side on every mutation: the admin client
// bypasses RLS, so each action re-runs the marketing-domain staff check (never weaker
// than the page's). Returns the staff context so create can stamp created_by.
async function gate(): Promise<
  { ok: true; profileId: string } | { ok: false; error: string }
> {
  const staff = await getStaffMember()
  if (!staff || !staffCan(staff.role, 'marketing')) {
    return { ok: false, error: 'Marketer access required.' }
  }
  return { ok: true, profileId: staff.profileId }
}

// Build the action_config jsonb from the validated inputs. Conditions are stored
// inside action_config (migration-free) and only when non-empty, so existing rows and
// the engine's "no conditions = always fire" default stay intact.
function buildConfig(
  input: RuleInput,
): { config: Record<string, Json> } | { error: string } {
  let config: Record<string, Json>
  if (input.actionType === 'push_actor') {
    const title = (input.pushTitle ?? '').trim()
    const body = (input.pushBody ?? '').trim()
    if (!title || !body) return { error: 'Push title and body are required.' }
    const url = (input.pushUrl ?? '').trim()
    config = url ? { title, body, url } : { title, body }
  } else {
    const subject = (input.subject ?? '').trim()
    const body = (input.body ?? '').trim()
    if (!subject || !body) return { error: 'Email subject and body are required.' }
    config = { subject, body }
  }
  const conditions = parseConditions(input.conditions)
  // AutomationCondition is a flat {field, op, value?} shape — Json-compatible; cast for the column type.
  if (conditions.length) config.conditions = conditions as unknown as Json
  return { config }
}

export async function createRule(input: RuleInput): Promise<RuleResult> {
  const g = await gate()
  if (!g.ok) return { ok: false, error: g.error }

  const name = input.name.trim()
  if (!name || !input.triggerEvent) return { ok: false, error: 'Name and trigger are required.' }
  if (!isAutomationActionType(input.actionType)) return { ok: false, error: 'Pick a valid channel.' }

  const built = buildConfig(input)
  if ('error' in built) return { ok: false, error: built.error }

  const db = createAdminClient()
  const { error } = await db.from('automation_rules').insert({
    name,
    trigger_event: input.triggerEvent,
    action_type: input.actionType,
    action_config: built.config,
    enabled: true,
    created_by: g.profileId,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/marketing/automations')
  return { ok: true }
}

export async function editRule(id: string, input: RuleInput): Promise<RuleResult> {
  const g = await gate()
  if (!g.ok) return { ok: false, error: g.error }
  if (!id) return { ok: false, error: 'Missing rule.' }

  const name = input.name.trim()
  if (!name || !input.triggerEvent) return { ok: false, error: 'Name and trigger are required.' }
  if (!isAutomationActionType(input.actionType)) return { ok: false, error: 'Pick a valid channel.' }

  const built = buildConfig(input)
  if ('error' in built) return { ok: false, error: built.error }

  const db = createAdminClient()
  const { error } = await db
    .from('automation_rules')
    .update({
      name,
      trigger_event: input.triggerEvent,
      action_type: input.actionType,
      action_config: built.config,
    })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/marketing/automations')
  return { ok: true }
}

export async function deleteRule(id: string): Promise<RuleResult> {
  const g = await gate()
  if (!g.ok) return { ok: false, error: g.error }
  if (!id) return { ok: false, error: 'Missing rule.' }

  const db = createAdminClient()
  const { error } = await db.from('automation_rules').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/marketing/automations')
  return { ok: true }
}

export async function toggleRule(id: string, enabled: boolean): Promise<void> {
  const g = await gate()
  if (!g.ok) return

  const db = createAdminClient()
  await db.from('automation_rules').update({ enabled }).eq('id', id)
  revalidatePath('/admin/marketing/automations')
}
