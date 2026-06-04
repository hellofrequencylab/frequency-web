'use server'

// A member restyling their own code. qr_codes is service-role only, so this gates
// on ownership before writing the (sanitized) style.

import { revalidatePath } from 'next/cache'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseStyle, type QrStyle } from '@/lib/qr/style'
import { generateSlug } from '@/lib/qr/codes'
import { MARKETING_CODE_LIMIT, isValidMarketingPath } from '@/lib/qr/marketing'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import type { Json } from '@/lib/database.types'

export interface MarketingInput {
  title: string
  /** Root-relative circle/event path the code points at. */
  path: string
  style: QrStyle
}

/** Crew-gated caller id, or an error message. */
async function requireCrew(): Promise<{ id: string } | string> {
  const me = await getCallerProfile()
  if (!me) return 'Sign in first.'
  if (!atLeastRole(me.community_role, 'crew')) return 'Marketing codes are a Crew feature.'
  return { id: me.id }
}

function cleanMarketing(input: MarketingInput): { title: string; target_url: string; style: Json } | string {
  const title = input.title.trim()
  if (!title) return 'Give your code a name.'
  if (!isValidMarketingPath(input.path)) return 'Pick a circle or event to point at.'
  return { title, target_url: input.path, style: parseStyle(input.style) as unknown as Json }
}

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

// ── Crew marketing codes (≤3 per member, point at a circle/event) ──────────────

export async function createMarketingCode(input: MarketingInput): Promise<ActionResult<{ id: string }>> {
  const crew = await requireCrew()
  if (typeof crew === 'string') return fail(crew)
  const row = cleanMarketing(input)
  if (typeof row === 'string') return fail(row)

  const db = createAdminClient()
  const { count } = await db
    .from('qr_codes')
    .select('id', { count: 'exact', head: true })
    .eq('owner_profile_id', crew.id)
    .is('purpose', null)
  if ((count ?? 0) >= MARKETING_CODE_LIMIT) {
    return fail(`You can have up to ${MARKETING_CODE_LIMIT} marketing codes. Delete one to add another.`)
  }

  const { data, error } = await db
    .from('qr_codes')
    .insert({
      slug: generateSlug(),
      title: row.title,
      destination_type: 'url',
      target_url: row.target_url,
      owner_profile_id: crew.id,
      created_by: crew.id,
      style: row.style,
    })
    .select('id')
    .single()
  if (error || !data) return fail('Could not create the code.')

  revalidatePath('/codes')
  return ok({ id: data.id })
}

export async function updateMarketingCode(id: string, input: MarketingInput): Promise<ActionResult> {
  const crew = await requireCrew()
  if (typeof crew === 'string') return fail(crew)
  const row = cleanMarketing(input)
  if (typeof row === 'string') return fail(row)

  const db = createAdminClient()
  // Ownership + that it really is one of this member's marketing codes (purpose null).
  const { data: code } = await db
    .from('qr_codes')
    .select('owner_profile_id, purpose')
    .eq('id', id)
    .maybeSingle()
  if (!code || code.owner_profile_id !== crew.id || code.purpose !== null) return fail('That isn’t your code.')

  const { error } = await db
    .from('qr_codes')
    .update({ title: row.title, target_url: row.target_url, style: row.style })
    .eq('id', id)
  if (error) return fail('Could not save changes.')

  revalidatePath('/codes')
  return ok()
}

export async function deleteMarketingCode(id: string): Promise<ActionResult> {
  const crew = await requireCrew()
  if (typeof crew === 'string') return fail(crew)

  const db = createAdminClient()
  const { data: code } = await db
    .from('qr_codes')
    .select('owner_profile_id, purpose')
    .eq('id', id)
    .maybeSingle()
  if (!code || code.owner_profile_id !== crew.id || code.purpose !== null) return fail('That isn’t your code.')

  const { error } = await db.from('qr_codes').delete().eq('id', id)
  if (error) return fail('Could not delete the code.')

  revalidatePath('/codes')
  return ok()
}
