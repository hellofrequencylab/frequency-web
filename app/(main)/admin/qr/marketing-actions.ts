'use server'

// Admin oversight of member "marketing funnel" codes (qr_codes with an owner and
// purpose IS NULL). Members self-manage these on /codes, gated on ownership; these
// host+ actions let an operator edit the design/title, pause, or retire any
// member's code for moderation/support. Service-role writes.

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseStyle, type QrStyle } from '@/lib/qr/style'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import type { Json } from '@/lib/database.types'

/** Confirm `id` is a member marketing code (owner set, purpose null) before any write. */
async function assertMarketing(
  db: ReturnType<typeof createAdminClient>,
  id: string,
): Promise<boolean> {
  const { data } = await db
    .from('qr_codes')
    .select('owner_profile_id, purpose')
    .eq('id', id)
    .maybeSingle()
  return Boolean(data && data.owner_profile_id && data.purpose === null)
}

export async function updateMarketingCodeAdmin(
  id: string,
  input: { title: string; style: QrStyle },
): Promise<ActionResult> {
  await requireAdmin('host')
  const title = input.title.trim()
  if (!title) return fail('Give the code a name.')

  const db = createAdminClient()
  if (!(await assertMarketing(db, id))) return fail('Not a member marketing code.')

  const { error } = await db
    .from('qr_codes')
    .update({ title, style: parseStyle(input.style) as unknown as Json })
    .eq('id', id)
  if (error) return fail('Could not save changes.')

  revalidatePath('/admin/qr')
  return ok()
}

export async function setMarketingActive(id: string, active: boolean): Promise<ActionResult> {
  await requireAdmin('host')
  const db = createAdminClient()
  if (!(await assertMarketing(db, id))) return fail('Not a member marketing code.')

  const { error } = await db.from('qr_codes').update({ active }).eq('id', id)
  if (error) return fail('Could not update the code.')

  revalidatePath('/admin/qr')
  return ok()
}

export async function deleteMarketingCodeAdmin(id: string): Promise<ActionResult> {
  await requireAdmin('host')
  const db = createAdminClient()
  if (!(await assertMarketing(db, id))) return fail('Not a member marketing code.')

  const { error } = await db.from('qr_codes').delete().eq('id', id)
  if (error) return fail('Could not delete the code.')

  revalidatePath('/admin/qr')
  return ok()
}
