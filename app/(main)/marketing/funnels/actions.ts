'use server'

// Campaign mutations for the admin funnels builder (ADR-126, Phase 2). Gated to a
// community admin OR a Studio staff member (same axis the /marketing layout uses).
// entry_campaigns isn't in the generated DB types until regen, so writes go through
// an untyped admin handle (repo convention).

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { getStaffMember } from '@/lib/staff'
import { createAdminClient } from '@/lib/supabase/admin'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { isEntryTemplateId } from '@/lib/entry-points/templates'
import { isAssignableMember } from '@/lib/entry-points/store'
import type { CampaignStatus } from '@/lib/entry-points/campaigns'

async function requireMarketer(): Promise<{ id: string } | string> {
  const me = await getCallerProfile()
  if (!me) return 'Sign in first.'
  if (atLeastRole(me.community_role, 'admin')) return { id: me.id }
  const staff = await getStaffMember().catch(() => null)
  if (staff) return { id: me.id }
  return 'Marketing access required.'
}

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

export interface CampaignInput {
  name: string
  /** Optional default template/goal key for the campaign. */
  goal?: string
}

export async function createCampaign(input: CampaignInput): Promise<ActionResult<{ id: string }>> {
  const who = await requireMarketer()
  if (typeof who === 'string') return fail(who)
  const name = input.name.trim().slice(0, 80)
  if (!name) return fail('Give the campaign a name.')
  const goal = input.goal && isEntryTemplateId(input.goal) ? input.goal : null

  const { data, error } = await db()
    .from('entry_campaigns')
    .insert({ name, goal, template_id: goal, owner_profile_id: who.id, status: 'active' })
    .select('id')
    .single()
  if (error || !data) return fail('Could not create the campaign.')

  revalidatePath('/marketing/funnels')
  return ok({ id: (data as { id: string }).id })
}

export async function updateCampaign(
  id: string,
  input: { name?: string; status?: CampaignStatus },
): Promise<ActionResult> {
  const who = await requireMarketer()
  if (typeof who === 'string') return fail(who)

  const patch: Record<string, unknown> = {}
  if (typeof input.name === 'string') {
    const name = input.name.trim().slice(0, 80)
    if (!name) return fail('Give the campaign a name.')
    patch.name = name
  }
  if (input.status && ['draft', 'active', 'archived'].includes(input.status)) patch.status = input.status
  if (Object.keys(patch).length === 0) return ok()

  const { error } = await db().from('entry_campaigns').update(patch).eq('id', id)
  if (error) return fail('Could not save the campaign.')

  revalidatePath('/marketing/funnels')
  revalidatePath(`/marketing/funnels/${id}`)
  return ok()
}

export async function archiveCampaign(id: string): Promise<ActionResult> {
  return updateCampaign(id, { status: 'archived' })
}

/**
 * Reassign an entry point to a crew member (ADR-126 Phase 2b). The new owner gets the
 * entry point in their "My Entry Points" + future scan credit on the recruiter board;
 * historical signup attribution (referred_by, set at scan time) is unchanged.
 */
export async function reassignEntryPoint(
  campaignId: string,
  codeId: string,
  newOwnerId: string,
): Promise<ActionResult> {
  const who = await requireMarketer()
  if (typeof who === 'string') return fail(who)
  if (!(await isAssignableMember(newOwnerId))) return fail('Pick an active crew member.')

  const { error } = await db()
    .from('qr_codes')
    .update({ owner_profile_id: newOwnerId })
    .eq('id', codeId)
    .not('template_id', 'is', null) // only entry points
  if (error) return fail('Could not reassign the entry point.')

  revalidatePath(`/marketing/funnels/${campaignId}`)
  revalidatePath('/entry-points')
  return ok()
}

/** Enable/disable an entry-point template for crew (ADR-126 Phase 2b governance). */
export async function setTemplateEnabled(templateId: string, enabled: boolean): Promise<ActionResult> {
  const who = await requireMarketer()
  if (typeof who === 'string') return fail(who)
  if (!isEntryTemplateId(templateId)) return fail('Unknown template.')

  const { error } = await db()
    .from('entry_template_settings')
    .upsert({ template_id: templateId, enabled, updated_at: new Date().toISOString() }, { onConflict: 'template_id' })
  if (error) return fail('Could not update the template.')

  revalidatePath('/marketing/funnels')
  revalidatePath('/entry-points')
  return ok()
}
