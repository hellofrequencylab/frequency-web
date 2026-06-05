'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import type { Database } from '@/lib/database.types'

// In-place "Circle settings" admin module (EMBEDDED-ADMIN.md / ADR-133, Phase-2
// pilot). Both the read and the write re-resolve the per-circle capability set via
// getCircleCapabilities — the dock's role-gated visibility is UX only; THIS is the
// authority (capabilities are law, capabilities.ts). The admin client bypasses
// RLS, so the check here — not RLS — is what protects the mutation.

/** Load the editable fields of a circle, but only for a viewer who may edit it.
 *  Returns null when the circle is missing or the caller lacks circle.editSettings
 *  (so the module renders no chrome for someone who can't manage this circle). */
export async function getCircleAdminData(slug: string) {
  const admin = createAdminClient()
  const { data: circle } = await admin
    .from('circles')
    .select('id, slug, name, about, type, member_cap, status')
    .eq('slug', slug)
    .maybeSingle()
  if (!circle) return null

  const caps = await getCircleCapabilities(circle.id)
  if (!caps.has('circle.editSettings')) return null

  return circle
}

/** Patch the day-to-day circle settings in place. Re-checks circle.editSettings
 *  before writing; leaves host_id / hub_id untouched (host/hub reassignment stays
 *  in the full admin editor). */
export async function updateCircleSettings(id: string, slug: string, fd: FormData) {
  const caps = await getCircleCapabilities(id)
  if (!caps.has('circle.editSettings')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await admin
    .from('circles')
    .update({
      name: (fd.get('name') as string).trim(),
      about: ((fd.get('about') as string) ?? '').trim() || null,
      type: fd.get('type') as Database['public']['Enums']['circle_type'],
      member_cap: parseInt(fd.get('member_cap') as string, 10) || 12,
      status: fd.get('status') as Database['public']['Enums']['group_status'],
    })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/circles/${slug}`)
  revalidatePath('/circles')
}
