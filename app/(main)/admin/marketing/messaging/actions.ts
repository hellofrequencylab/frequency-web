'use server'

// Flow-view mutations for the Messaging console (EMAIL-CAMPAIGNS-FUNNELS-PLAN P4). The
// funnel identity / link / status mutations already exist (app/(main)/admin/growth/
// funnels/actions.ts) and are reused by the flow view; the ONE net-new mutation the
// flow view needs is reordering stages by drag (the native-DnD pattern from the CRM
// stage editor), which persists the full permutation of funnel_stages.position.
//
// Every action RE-CHECKS the marketing capability server-side (the page gate is UX
// only; the admin client bypasses RLS, so the action is the authority). The funnels
// tables are not in the generated DB types until regen, so writes go through an untyped
// admin handle (repo convention, ADR-246).

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCallerProfile } from '@/lib/auth'
import { isStaff } from '@/lib/core/roles'
import { getStaffMember, staffCan } from '@/lib/staff'
import { createAdminClient } from '@/lib/supabase/admin'
import { ok, fail, type ActionResult } from '@/lib/action-result'

/** Marketing-capability gate, mirroring the growth funnel actions. Returns the caller
 *  id or a human-readable error (a soft fail, never a redirect, since these are called
 *  from client transitions). */
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

function revalidate(funnelId: string) {
  revalidatePath('/admin/marketing/messaging')
  revalidatePath(`/admin/marketing/messaging/funnels/${funnelId}`)
  revalidatePath('/admin/growth/funnels')
  revalidatePath(`/admin/growth/funnels/${funnelId}`)
}

interface StageRow {
  id: string
  position: number
}

/** Reorder a funnel's stages to `orderedStageIds` (the full permutation, as the CRM
 *  stage editor persists it). Validates the id set matches the funnel's stages exactly,
 *  then rewrites positions in two passes to stay clear of the unique (funnel_id,
 *  position) index. */
export async function reorderFunnelStages(
  funnelId: string,
  orderedStageIds: string[],
): Promise<ActionResult> {
  const who = await requireMarketer()
  if (typeof who === 'string') return fail(who)
  if (!funnelId) return fail('Missing funnel.')
  if (!Array.isArray(orderedStageIds) || orderedStageIds.length === 0) return fail('Nothing to reorder.')

  const { data } = await db().from('funnel_stages').select('id, position').eq('funnel_id', funnelId)
  const current = (data as StageRow[] | null) ?? []
  const currentIds = new Set(current.map((s) => s.id))
  const nextIds = new Set(orderedStageIds)
  // The permutation must cover exactly the funnel's stages (no adds, drops, or strays).
  if (currentIds.size !== nextIds.size || orderedStageIds.some((id) => !currentIds.has(id))) {
    return fail('The order does not match this funnel. Refresh and try again.')
  }

  // Pass 1: park every stage at a unique negative slot so pass 2 never collides with a
  // still-live positive position under the unique index.
  for (let i = 0; i < orderedStageIds.length; i++) {
    const { error } = await db()
      .from('funnel_stages')
      .update({ position: -(i + 1) })
      .eq('id', orderedStageIds[i])
      .eq('funnel_id', funnelId)
    if (error) return fail('Could not save the new order.')
  }
  // Pass 2: settle to the final 0-based positions.
  for (let i = 0; i < orderedStageIds.length; i++) {
    const { error } = await db()
      .from('funnel_stages')
      .update({ position: i })
      .eq('id', orderedStageIds[i])
      .eq('funnel_id', funnelId)
    if (error) return fail('Could not save the new order.')
  }

  revalidate(funnelId)
  return ok()
}

/** Rename one stage (the flow view's side-panel label edit). */
export async function renameFunnelStage(
  funnelId: string,
  stageId: string,
  label: string,
): Promise<ActionResult> {
  const who = await requireMarketer()
  if (typeof who === 'string') return fail(who)
  if (!funnelId || !stageId) return fail('Missing stage.')
  const trimmed = label.trim()
  if (!trimmed) return fail('Give the step a name.')

  const { error } = await db()
    .from('funnel_stages')
    .update({ label: trimmed.slice(0, 120) })
    .eq('id', stageId)
    .eq('funnel_id', funnelId)
  if (error) return fail('Could not rename the step.')

  revalidate(funnelId)
  return ok()
}
