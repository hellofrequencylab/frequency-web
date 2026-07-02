'use server'

// Funnel mutations for the Growth OS funnel builder (Engine 2, GE2-3/GE2-4, ADR-455).
// Every action RE-CHECKS the marketing capability server-side (the page gate is UX
// only; the admin client bypasses RLS, so the action is the authority). The funnels
// tables are not in the generated DB types until regen, so writes go through an
// untyped admin handle (repo convention, see the entry-points funnels actions).

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCallerProfile } from '@/lib/auth'
import { isStaff } from '@/lib/core/roles'
import { getStaffMember, staffCan } from '@/lib/staff'
import { createAdminClient } from '@/lib/supabase/admin'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { slugify } from '@/lib/utils'
import { PERSONA_ORDER, type PersonaId } from '@/lib/onboarding/personas'
import { FUNNEL_STAGE_ORDER, STAGE_KIND_META, getFunnelTemplate } from '@/lib/funnels/templates'
import { funnelSlugExists } from '@/lib/funnels/store'

/** Marketing-capability gate (same axis the /marketing layout + entry-points
 *  funnels actions use). Returns the caller id or a human-readable error. */
async function requireMarketer(): Promise<{ id: string } | string> {
  const me = await getCallerProfile()
  if (!me) return 'Sign in first.'
  if (isStaff(me.webRole)) return { id: me.id }
  const staff = await getStaffMember().catch(() => null)
  if (staff && staffCan(staff.role, 'marketing', 'write')) return { id: me.id }
  return 'Marketing access required.'
}

function db(): SupabaseClient {
  return createAdminClient()
}

/** A free slug derived from `name`, suffixed with a short random tail on collision. */
async function freeSlug(name: string): Promise<string> {
  const base = slugify(name).slice(0, 60) || 'funnel'
  if (!(await funnelSlugExists(base))) return base
  return `${base}-${Math.random().toString(36).slice(2, 6)}`
}

const STATUSES = ['draft', 'active', 'archived'] as const
type Status = (typeof STATUSES)[number]

function asPersona(value: string | null | undefined): PersonaId | null {
  return value && (PERSONA_ORDER as string[]).includes(value) ? (value as PersonaId) : null
}

export interface CreateFunnelInput {
  name: string
  description?: string
  persona?: string | null
  goalEvent?: string
}

/** Create a blank funnel with the four canonical stages (entry/wedge/capture/convert),
 *  ready to wire in the builder. Returns the new funnel id. */
export async function createFunnel(input: CreateFunnelInput): Promise<ActionResult<{ id: string }>> {
  const who = await requireMarketer()
  if (typeof who === 'string') return fail(who)

  const name = input.name?.trim()
  if (!name) return fail('Give the funnel a name.')

  const slug = await freeSlug(name)
  const { data, error } = await db()
    .from('funnels')
    .insert({
      slug,
      name: name.slice(0, 120),
      description: input.description?.trim()?.slice(0, 400) || null,
      persona: asPersona(input.persona),
      goal_event: (input.goalEvent?.trim() || 'signup').slice(0, 80),
      status: 'draft',
      owner_profile_id: who.id,
      created_by: who.id,
    })
    .select('id')
    .single()
  if (error || !data) return fail('Could not create the funnel.')

  const funnelId = (data as { id: string }).id
  const stageRows = FUNNEL_STAGE_ORDER.map((kind, position) => ({
    funnel_id: funnelId,
    kind,
    label: STAGE_KIND_META[kind].label,
    position,
  }))
  const { error: stageErr } = await db().from('funnel_stages').insert(stageRows)
  if (stageErr) {
    // Roll back the orphan funnel so a half-built, stage-less funnel never lingers.
    await db().from('funnels').delete().eq('id', funnelId)
    return fail('Could not set up the funnel stages.')
  }

  revalidatePath('/admin/growth/funnels')
  return ok({ id: funnelId })
}

/** Clone a per-persona template (GE2-4) into a new funnel: its named stages, its
 *  suggested goal event, and its default key-pointer links. Returns the new id. */
export async function createFunnelFromTemplate(templateKey: string): Promise<ActionResult<{ id: string }>> {
  const who = await requireMarketer()
  if (typeof who === 'string') return fail(who)

  const tpl = getFunnelTemplate(templateKey)
  if (!tpl) return fail('Unknown template.')

  const slug = await freeSlug(tpl.label)
  const { data, error } = await db()
    .from('funnels')
    .insert({
      slug,
      name: tpl.label.slice(0, 120),
      description: tpl.blurb.slice(0, 400),
      persona: tpl.persona,
      template_key: tpl.key,
      goal_event: tpl.goalEvent,
      status: 'draft',
      owner_profile_id: who.id,
      created_by: who.id,
    })
    .select('id')
    .single()
  if (error || !data) return fail('Could not create the funnel from the template.')
  const funnelId = (data as { id: string }).id

  const stageRows = tpl.stages.map((s, position) => ({
    funnel_id: funnelId,
    kind: s.kind,
    label: s.label.slice(0, 120),
    position,
  }))
  const { data: stages, error: stageErr } = await db()
    .from('funnel_stages')
    .insert(stageRows)
    .select('id, position')
  if (stageErr) {
    // Roll back the orphan funnel (stages/links cascade off it) — a template clone is all-or-nothing.
    await db().from('funnels').delete().eq('id', funnelId)
    return fail('Could not set up the funnel stages.')
  }
  const stageByPos = new Map<number, string>()
  for (const s of (stages as { id: string; position: number }[] | null) ?? []) {
    stageByPos.set(s.position, s.id)
  }

  // Seed the default key-pointer links (page/lead_flow/custom) the template suggests.
  const linkRows: Array<{ stage_id: string; ref_type: string; ref_key: string }> = []
  tpl.stages.forEach((s, position) => {
    const stageId = stageByPos.get(position)
    if (stageId && s.link) {
      linkRows.push({ stage_id: stageId, ref_type: s.link.refType, ref_key: s.link.refKey })
    }
  })
  if (linkRows.length) {
    const { error: linkErr } = await db().from('funnel_stage_links').insert(linkRows)
    if (linkErr) {
      // Same all-or-nothing rule — delete the funnel (cascade clears its stages + any links).
      await db().from('funnels').delete().eq('id', funnelId)
      return fail('Could not seed the funnel links.')
    }
  }

  revalidatePath('/admin/growth/funnels')
  return ok({ id: funnelId })
}

export interface UpdateFunnelInput {
  id: string
  name?: string
  description?: string | null
  persona?: string | null
  goalEvent?: string
  status?: string
}

/** Edit a funnel's identity (name/description/persona/goal) and lifecycle status. */
export async function updateFunnel(input: UpdateFunnelInput): Promise<ActionResult> {
  const who = await requireMarketer()
  if (typeof who === 'string') return fail(who)
  if (!input.id) return fail('Missing funnel.')

  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) {
    const n = input.name.trim()
    if (!n) return fail('Give the funnel a name.')
    patch.name = n.slice(0, 120)
  }
  if (input.description !== undefined) patch.description = input.description?.trim()?.slice(0, 400) || null
  if (input.persona !== undefined) patch.persona = asPersona(input.persona)
  if (input.goalEvent !== undefined) patch.goal_event = (input.goalEvent.trim() || 'signup').slice(0, 80)
  if (input.status !== undefined) {
    if (!(STATUSES as readonly string[]).includes(input.status)) return fail('Unknown status.')
    patch.status = input.status as Status
  }
  if (Object.keys(patch).length === 0) return ok()

  const { error } = await db().from('funnels').update(patch).eq('id', input.id)
  if (error) return fail('Could not save the funnel.')

  revalidatePath('/admin/growth/funnels')
  revalidatePath(`/admin/growth/funnels/${input.id}`)
  return ok()
}

/** Archive a funnel (soft retire; status flips to archived, nothing is deleted). */
export async function archiveFunnel(id: string): Promise<ActionResult> {
  return updateFunnel({ id, status: 'archived' })
}

export interface StageLinkInput {
  stageId: string
  refType: string
  /** uuid-pointer types (entry_point/campaign/nurture). */
  refId?: string | null
  /** key-pointer types (page/lead_flow/custom). */
  refKey?: string | null
}

const REF_TYPES = ['entry_point', 'campaign', 'page', 'lead_flow', 'nurture', 'custom'] as const
const ID_POINTER: ReadonlySet<string> = new Set(['entry_point', 'campaign', 'nurture'])

/** Attach a typed soft-reference link to a stage (wire a stage to an existing
 *  component, GE2-5). Enforces the one-pointer rule the DB also checks. */
export async function addStageLink(input: StageLinkInput): Promise<ActionResult> {
  const who = await requireMarketer()
  if (typeof who === 'string') return fail(who)
  if (!input.stageId) return fail('Missing stage.')
  if (!(REF_TYPES as readonly string[]).includes(input.refType)) return fail('Unknown reference type.')

  const useId = ID_POINTER.has(input.refType)
  const refId = useId ? input.refId?.trim() || null : null
  const refKey = useId ? null : input.refKey?.trim() || null
  if (useId && !refId) return fail('Pick the component to link.')
  if (!useId && !refKey) return fail('Enter the link target.')

  const { error } = await db().from('funnel_stage_links').insert({
    stage_id: input.stageId,
    ref_type: input.refType,
    ref_id: refId,
    ref_key: refKey,
  })
  if (error) return fail('Could not link the component.')

  revalidatePath('/admin/growth/funnels')
  return ok()
}

/** Remove a stage link. */
export async function removeStageLink(linkId: string): Promise<ActionResult> {
  const who = await requireMarketer()
  if (typeof who === 'string') return fail(who)
  if (!linkId) return fail('Missing link.')
  const { error } = await db().from('funnel_stage_links').delete().eq('id', linkId)
  if (error) return fail('Could not remove the link.')
  revalidatePath('/admin/growth/funnels')
  return ok()
}
