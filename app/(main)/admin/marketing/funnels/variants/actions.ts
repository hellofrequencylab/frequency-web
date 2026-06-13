'use server'

// Admin actions for entry-point A/B variants (ADR-136). Gated to admin/staff like the
// rest of /marketing. Variant targets are validated as known-safe internal entry
// destinations (no open redirect — same guard entry points use). Untyped admin handle.

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCallerProfile } from '@/lib/auth'
import { isStaff } from '@/lib/core/roles'
import { getStaffMember } from '@/lib/staff'
import { createAdminClient } from '@/lib/supabase/admin'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { isValidEntryDestination } from '@/lib/entry-points/destinations'

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

function cleanWeight(w: number): number {
  return Number.isFinite(w) && w > 0 ? Math.min(Math.round(w), 100) : 1
}

export async function addVariant(
  codeId: string,
  input: { key: string; label: string; targetUrl: string; weight: number },
): Promise<ActionResult> {
  const who = await requireMarketer()
  if (typeof who === 'string') return fail(who)

  const key = input.key.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 16)
  if (!key) return fail('Give the variant a short key (e.g. “a”).')
  const label = input.label.trim().slice(0, 60) || key
  const targetUrl = input.targetUrl.trim()
  if (!isValidEntryDestination(targetUrl)) return fail('Pick a valid destination.')

  const { error } = await db().from('entry_point_variants').insert({
    qr_code_id: codeId,
    variant_key: key,
    label,
    target_url: targetUrl,
    weight: cleanWeight(input.weight),
    active: true,
  })
  if (error) return fail('That variant key may already exist for this entry point.')

  revalidatePath(`/admin/marketing/funnels/variants/${codeId}`)
  return ok()
}

export async function updateVariant(
  codeId: string,
  id: string,
  input: { label: string; targetUrl: string; weight: number; active?: boolean },
): Promise<ActionResult> {
  const who = await requireMarketer()
  if (typeof who === 'string') return fail(who)
  const targetUrl = input.targetUrl.trim()
  if (!isValidEntryDestination(targetUrl)) return fail('Pick a valid destination.')

  const { error } = await db()
    .from('entry_point_variants')
    .update({
      label: input.label.trim().slice(0, 60),
      target_url: targetUrl,
      weight: cleanWeight(input.weight),
      ...(typeof input.active === 'boolean' ? { active: input.active } : {}),
    })
    .eq('id', id)
  if (error) return fail('Could not save the variant.')

  revalidatePath(`/admin/marketing/funnels/variants/${codeId}`)
  return ok()
}

export async function deleteVariant(codeId: string, id: string): Promise<ActionResult> {
  const who = await requireMarketer()
  if (typeof who === 'string') return fail(who)
  const { error } = await db().from('entry_point_variants').delete().eq('id', id)
  if (error) return fail('Could not delete the variant.')
  revalidatePath(`/admin/marketing/funnels/variants/${codeId}`)
  return ok()
}
