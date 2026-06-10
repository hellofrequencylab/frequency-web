'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { isStaff } from '@/lib/core/roles'

// In-place "Channel settings" admin module (EMBEDDED-ADMIN.md / ADR-133, PX.5).
// Topical channels are PLATFORM-CURATED — there is no per-channel host, so both
// the read and the write gate on staff (admin+), mirroring channel.manage in
// capabilities.ts. The admin client bypasses RLS; the check here is the authority.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function isChannelManager(): Promise<boolean> {
  const caller = await getCallerProfile()
  return !!caller && isStaff(caller.webRole)
}

/** Load the editable fields of a topical channel, but only for staff (admin+).
 *  Returns null otherwise — the module renders no chrome for non-operators. */
export async function getChannelAdminData(idOrSlug: string) {
  if (!(await isChannelManager())) return null

  const admin = createAdminClient()
  const matchField = UUID_RE.test(idOrSlug) ? 'id' : 'slug'
  const { data: channel } = await admin
    .from('topical_channels')
    .select('id, name, slug, category, description, is_active')
    .eq(matchField, idOrSlug)
    .maybeSingle()
  return channel ?? null
}

/** Patch a topical channel's curated fields in place. Staff (admin+) only. */
export async function updateChannelSettings(id: string, fd: FormData) {
  if (!(await isChannelManager())) throw new Error('Unauthorized')

  const name = ((fd.get('name') as string) ?? '').trim()
  if (!name) throw new Error('Name is required')

  const admin = createAdminClient()
  const { error } = await admin
    .from('topical_channels')
    .update({
      name,
      category: ((fd.get('category') as string) ?? '').trim() || 'general',
      description: ((fd.get('description') as string) ?? '').trim() || null,
      is_active: fd.get('is_active') === 'on',
    })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/channels/${id}`)
  revalidatePath('/channels')
}
