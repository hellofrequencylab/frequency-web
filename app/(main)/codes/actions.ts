'use server'

// A member restyling their own code. qr_codes is service-role only, so this gates
// on ownership before writing the (sanitized) style.

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseStyle, type QrStyle } from '@/lib/qr/style'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import type { Json } from '@/lib/database.types'

export async function updateMyCodeStyle(codeId: string, style: QrStyle): Promise<ActionResult> {
  const me = await getMyProfileId()
  if (!me) return fail('Sign in first.')

  const db = createAdminClient()
  const { data: code } = await db
    .from('qr_codes')
    .select('owner_profile_id')
    .eq('id', codeId)
    .maybeSingle()
  if (!code || code.owner_profile_id !== me) return fail('That isn’t your code.')

  const { error } = await db
    .from('qr_codes')
    .update({ style: parseStyle(style) as unknown as Json })
    .eq('id', codeId)
  if (error) return fail('Could not save your design.')

  revalidatePath('/codes')
  return ok()
}
