'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getHubCapabilities } from '@/lib/core/load-capabilities'
import type { Database } from '@/lib/database.types'

// In-place "Hub settings" admin module (EMBEDDED-ADMIN.md / ADR-133). Read + write
// both re-resolve hub.manage server-side — the dock's role gate is UX; this is the
// authority (the admin client bypasses RLS). Guide/nexus reassignment stays in the
// full admin editor (/admin/hubs); this patches the day-to-day fields only.

export async function getHubAdminData(slug: string) {
  const admin = createAdminClient()
  const { data: hub } = await admin
    .from('hubs')
    .select('id, slug, name, status')
    .eq('slug', slug)
    .maybeSingle()
  if (!hub) return null

  const caps = await getHubCapabilities(hub.id)
  if (!caps.has('hub.manage')) return null

  return hub
}

export async function updateHubSettings(id: string, slug: string, fd: FormData) {
  const caps = await getHubCapabilities(id)
  if (!caps.has('hub.manage')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await admin
    .from('hubs')
    .update({
      name: (fd.get('name') as string).trim(),
      status: fd.get('status') as Database['public']['Enums']['group_status'],
    })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/hubs/${slug}`)
  revalidatePath('/hubs')
}
