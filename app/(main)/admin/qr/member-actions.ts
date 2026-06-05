'use server'

// Admin (host+) edits of a member's profile code: its design (qr_codes.style) and
// its contact card (profiles.vcard). Service-role writes; the member can still edit
// their own on /codes — this just lets an operator help.

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseStyle, type QrStyle } from '@/lib/qr/style'
import { parseVcard, type VcardConfig } from '@/lib/vcard'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import type { Json } from '@/lib/database.types'

/** Restyle a member's profile code. */
export async function updateMemberCodeStyle(codeId: string, style: QrStyle): Promise<ActionResult> {
  await requireAdmin('host')
  const db = createAdminClient()
  const { data: code } = await db.from('qr_codes').select('purpose').eq('id', codeId).maybeSingle()
  if (!code || code.purpose !== 'connect') return fail('Not a member profile code.')
  const { error } = await db
    .from('qr_codes')
    .update({ style: parseStyle(style) as unknown as Json })
    .eq('id', codeId)
  if (error) return fail('Could not save the design.')
  revalidatePath('/admin/qr')
  return ok()
}

/** Edit a member's contact card (vCard). */
export async function updateMemberVcard(profileId: string, config: VcardConfig): Promise<ActionResult> {
  await requireAdmin('host')
  const db = createAdminClient()
  const { error } = await db
    .from('profiles')
    .update({ vcard: parseVcard(config) as unknown as Json })
    .eq('id', profileId)
  if (error) return fail('Could not save the contact card.')
  revalidatePath('/admin/qr')
  return ok()
}
