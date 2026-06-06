'use server'

// Support console actions (ADR-159) — staff triage. Gated to host+ (the Studio
// default for this area; a janitor can retune it from the permission grid). Writes
// go through the service-role store behind this authz.

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { updateTicketFields, addStaffMessage, type TicketUpdate } from '@/lib/support/store'

async function requireAgent(): Promise<{ id: string } | string> {
  const me = await getCallerProfile()
  if (!me) return 'Sign in first.'
  if (!atLeastRole(me.community_role, 'host')) return 'Support console is staff-only.'
  return { id: me.id }
}

export async function setTicketFields(id: string, patch: TicketUpdate): Promise<ActionResult> {
  const agent = await requireAgent()
  if (typeof agent === 'string') return fail(agent)
  await updateTicketFields(id, patch)
  revalidatePath(`/admin/support/${id}`)
  revalidatePath('/admin/support')
  return ok()
}

export async function staffReply(id: string, body: string, isInternal: boolean): Promise<ActionResult> {
  const agent = await requireAgent()
  if (typeof agent === 'string') return fail(agent)
  if (!body.trim()) return fail('Write a message first.')
  await addStaffMessage(id, agent.id, body, isInternal)
  revalidatePath(`/admin/support/${id}`)
  revalidatePath('/admin/support')
  return ok()
}
