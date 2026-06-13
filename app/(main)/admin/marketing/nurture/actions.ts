'use server'

// Admin actions for per-persona nurture sequences (ADR-131). Gated to a community
// admin OR a Studio staff member — same axis as the /marketing layout + funnels.
// nurture_* tables are untyped until regen, so writes go through an untyped admin
// handle (repo convention).

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCallerProfile } from '@/lib/auth'
import { isStaff } from '@/lib/core/roles'
import { getStaffMember } from '@/lib/staff'
import { createAdminClient } from '@/lib/supabase/admin'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { isPersonaId, getPersona } from '@/lib/onboarding/personas'
import { validateStepInput } from '@/lib/nurture/schedule'

async function requireMarketer(): Promise<{ id: string } | string> {
  const me = await getCallerProfile()
  if (!me) return 'Sign in first.'
  if (isStaff(me.webRole)) return { id: me.id }
  const staff = await getStaffMember().catch(() => null)
  if (staff) return { id: me.id }
  return 'Marketing access required.'
}

function db(): SupabaseClient {
  return createAdminClient()
}

/** Create a persona's sequence (one per persona) seeded with a starter welcome step. */
export async function createSequence(persona: string): Promise<ActionResult<{ id: string }>> {
  const who = await requireMarketer()
  if (typeof who === 'string') return fail(who)
  if (!isPersonaId(persona)) return fail('Unknown persona.')

  const p = getPersona(persona)
  const { data, error } = await db()
    .from('nurture_sequences')
    .insert({ persona, name: `${p.label} nurture`, enabled: true, created_by: who.id })
    .select('id')
    .single()
  if (error || !data) return fail('A sequence for that persona may already exist.')

  const sequenceId = (data as { id: string }).id
  // Seed one welcome step (delay 0 → goes out on the next cron after enrollment).
  await db().from('nurture_steps').insert({
    sequence_id: sequenceId,
    step_order: 1,
    delay_hours: 0,
    subject: `Welcome to Frequency`,
    body: `Hi. Thanks for raising your hand as someone who ${p.pitch.toLowerCase()}.\n\nFrequency is your local community; here's what to do next to get the most out of it. We'll send a couple more notes over the coming days.`,
    enabled: true,
  })

  revalidatePath('/admin/marketing/nurture')
  return ok({ id: sequenceId })
}

export async function toggleSequence(id: string, enabled: boolean): Promise<ActionResult> {
  const who = await requireMarketer()
  if (typeof who === 'string') return fail(who)
  const { error } = await db().from('nurture_sequences').update({ enabled }).eq('id', id)
  if (error) return fail('Could not update the sequence.')
  revalidatePath('/admin/marketing/nurture')
  return ok()
}

export async function addStep(
  sequenceId: string,
  input: { delayHours: number; subject: string; body: string },
): Promise<ActionResult> {
  const who = await requireMarketer()
  if (typeof who === 'string') return fail(who)
  const invalid = validateStepInput(input)
  if (invalid) return fail(invalid)

  // Next order = max existing + 1.
  const { data: last } = await db()
    .from('nurture_steps')
    .select('step_order')
    .eq('sequence_id', sequenceId)
    .order('step_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrder = ((last as { step_order: number } | null)?.step_order ?? 0) + 1

  const { error } = await db().from('nurture_steps').insert({
    sequence_id: sequenceId,
    step_order: nextOrder,
    delay_hours: input.delayHours,
    subject: input.subject.trim().slice(0, 160),
    body: input.body.trim().slice(0, 4000),
    enabled: true,
  })
  if (error) return fail('Could not add the step.')
  revalidatePath('/admin/marketing/nurture')
  return ok()
}

export async function updateStep(
  id: string,
  input: { delayHours: number; subject: string; body: string; enabled?: boolean },
): Promise<ActionResult> {
  const who = await requireMarketer()
  if (typeof who === 'string') return fail(who)
  const invalid = validateStepInput(input)
  if (invalid) return fail(invalid)
  const { error } = await db()
    .from('nurture_steps')
    .update({
      delay_hours: input.delayHours,
      subject: input.subject.trim().slice(0, 160),
      body: input.body.trim().slice(0, 4000),
      ...(typeof input.enabled === 'boolean' ? { enabled: input.enabled } : {}),
    })
    .eq('id', id)
  if (error) return fail('Could not save the step.')
  revalidatePath('/admin/marketing/nurture')
  return ok()
}

export async function deleteStep(id: string): Promise<ActionResult> {
  const who = await requireMarketer()
  if (typeof who === 'string') return fail(who)
  const { error } = await db().from('nurture_steps').delete().eq('id', id)
  if (error) return fail('Could not delete the step.')
  revalidatePath('/admin/marketing/nurture')
  return ok()
}
