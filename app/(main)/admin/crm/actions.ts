'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Database } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// The CRM suite is a steward tool — hosts and up. Every action gates here, and
// writes go through the untyped admin client (crm_* tables aren't in the generated
// types yet — same cast as lib/crm/pipeline.ts).
async function requireCrm(): Promise<string> {
  const caller = await getCallerProfile()
  if (!caller || !atLeastRole(caller.community_role, 'host')) throw new Error('Unauthorized')
  return caller.id
}

function db() {
  return createAdminClient()
}

async function firstStageId(): Promise<string | null> {
  const { data } = await db().from('crm_stages').select('id').order('sort_order').limit(1).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

async function stageKind(stageId: string): Promise<'open' | 'won' | 'lost'> {
  const { data } = await db().from('crm_stages').select('kind').eq('id', stageId).maybeSingle()
  return ((data as { kind?: string } | null)?.kind as 'open' | 'won' | 'lost') ?? 'open'
}

// ── Deals ─────────────────────────────────────────────────────────────────────

export async function createDeal(input: {
  title: string
  contactName?: string
  value?: number
  stageId?: string
  expectedCloseDate?: string | null
  source?: string
}): Promise<ActionResult<{ id: string }>> {
  const me = await requireCrm()
  const title = input.title?.trim()
  if (!title) return fail('A deal needs a title.')

  const stageId = input.stageId || (await firstStageId())
  const kind = stageId ? await stageKind(stageId) : 'open'

  const { data, error } = await db()
    .from('crm_deals')
    .insert({
      title,
      contact_name: input.contactName?.trim() || null,
      value: Number.isFinite(input.value) ? input.value : 0,
      stage_id: stageId,
      status: kind,
      closed_at: kind === 'open' ? null : new Date().toISOString(),
      expected_close_date: input.expectedCloseDate || null,
      source: input.source?.trim() || null,
      owner_id: me,
      created_by: me,
    })
    .select('id')
    .maybeSingle()

  if (error) return fail(error.message)
  revalidatePath('/admin/crm')
  return ok({ id: (data as { id: string }).id })
}

// Start a deal from a contact/member — links the profile, then opens the detail.
export async function createDealForProfile(profileId: string, name: string): Promise<void> {
  const me = await requireCrm()
  const stageId = await firstStageId()
  const { data } = await db()
    .from('crm_deals')
    .insert({
      title: `${name || 'New'} opportunity`,
      contact_name: name || null,
      profile_id: profileId,
      stage_id: stageId,
      status: 'open',
      owner_id: me,
      created_by: me,
    })
    .select('id')
    .maybeSingle()
  revalidatePath('/admin/crm')
  const id = (data as { id: string } | null)?.id
  if (id) redirect(`/admin/crm/deals/${id}`)
  redirect('/admin/crm')
}

export async function moveDeal(dealId: string, stageId: string): Promise<ActionResult> {
  await requireCrm()
  const kind = await stageKind(stageId)
  const { error } = await db()
    .from('crm_deals')
    .update({
      stage_id: stageId,
      status: kind,
      closed_at: kind === 'open' ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId)
  if (error) return fail(error.message)
  revalidatePath('/admin/crm')
  revalidatePath(`/admin/crm/deals/${dealId}`)
  return ok()
}

export async function updateDeal(
  dealId: string,
  patch: {
    title?: string
    contactName?: string | null
    value?: number
    expectedCloseDate?: string | null
    source?: string | null
  },
): Promise<ActionResult> {
  await requireCrm()
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.title !== undefined) {
    if (!patch.title.trim()) return fail('A deal needs a title.')
    row.title = patch.title.trim()
  }
  if (patch.contactName !== undefined) row.contact_name = patch.contactName?.trim() || null
  if (patch.value !== undefined) row.value = Number.isFinite(patch.value) ? patch.value : 0
  if (patch.expectedCloseDate !== undefined) row.expected_close_date = patch.expectedCloseDate || null
  if (patch.source !== undefined) row.source = patch.source?.trim() || null

  const { error } = await db().from('crm_deals').update(row as Database['public']['Tables']['crm_deals']['Update']).eq('id', dealId)
  if (error) return fail(error.message)
  revalidatePath('/admin/crm')
  revalidatePath(`/admin/crm/deals/${dealId}`)
  return ok()
}

export async function deleteDeal(dealId: string): Promise<ActionResult> {
  await requireCrm()
  const { error } = await db().from('crm_deals').delete().eq('id', dealId)
  if (error) return fail(error.message)
  revalidatePath('/admin/crm')
  return ok()
}

// ── Activities & tasks ──────────────────────────────────────────────────────

export async function addActivity(input: {
  dealId: string
  kind: 'note' | 'call' | 'email' | 'meeting' | 'task'
  body: string
  dueAt?: string | null
}): Promise<ActionResult> {
  const me = await requireCrm()
  const body = input.body?.trim()
  if (!body && input.kind !== 'task') return fail('Write something first.')
  const { error } = await db().from('crm_activities').insert({
    deal_id: input.dealId,
    kind: input.kind,
    body: body || '',
    due_at: input.kind === 'task' ? input.dueAt || null : null,
    created_by: me,
  })
  if (error) return fail(error.message)
  revalidatePath(`/admin/crm/deals/${input.dealId}`)
  revalidatePath('/admin/crm')
  return ok()
}

export async function toggleTask(activityId: string, dealId: string, done: boolean): Promise<ActionResult> {
  await requireCrm()
  const { error } = await db()
    .from('crm_activities')
    .update({ completed_at: done ? new Date().toISOString() : null })
    .eq('id', activityId)
  if (error) return fail(error.message)
  revalidatePath(`/admin/crm/deals/${dealId}`)
  revalidatePath('/admin/crm')
  return ok()
}

export async function deleteActivity(activityId: string, dealId: string): Promise<ActionResult> {
  await requireCrm()
  const { error } = await db().from('crm_activities').delete().eq('id', activityId)
  if (error) return fail(error.message)
  revalidatePath(`/admin/crm/deals/${dealId}`)
  return ok()
}
