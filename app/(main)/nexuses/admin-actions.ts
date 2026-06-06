'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getNexusCapabilities } from '@/lib/core/load-capabilities'
import type { Database } from '@/lib/database.types'

// In-place "Nexus settings" admin module (EMBEDDED-ADMIN.md / ADR-133). Read +
// write both re-resolve nexus.manage server-side (the dock's role gate is UX; this
// is the authority — the admin client bypasses RLS). Mentor reassignment stays in
// the full admin editor (/admin/nexuses); this patches the day-to-day fields only.

export async function getNexusAdminData(slug: string) {
  const admin = createAdminClient()
  const { data: nexus } = await admin
    .from('nexuses')
    .select('id, slug, name, member_cap, status')
    .eq('slug', slug)
    .maybeSingle()
  if (!nexus) return null

  const caps = await getNexusCapabilities(nexus.id)
  if (!caps.has('nexus.manage')) return null

  return nexus
}

export async function updateNexusSettings(id: string, slug: string, fd: FormData) {
  const caps = await getNexusCapabilities(id)
  if (!caps.has('nexus.manage')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await admin
    .from('nexuses')
    .update({
      name: (fd.get('name') as string).trim(),
      member_cap: parseInt(fd.get('member_cap') as string, 10) || 100,
      status: fd.get('status') as Database['public']['Enums']['group_status'],
    })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/nexuses/${slug}`)
  revalidatePath('/nexuses')
}

// Field-level patch for the inline tuning layer (ADR-138). Allowlisted; re-checks
// nexus.manage, same as the full settings form.
const INLINE_FIELDS = ['name'] as const
type InlineField = (typeof INLINE_FIELDS)[number]

export async function updateNexusField(id: string, slug: string, field: InlineField, value: string) {
  if (!INLINE_FIELDS.includes(field)) throw new Error('Invalid field')

  const caps = await getNexusCapabilities(id)
  if (!caps.has('nexus.manage')) throw new Error('Unauthorized')

  const trimmed = value.trim()
  if (!trimmed) throw new Error('Name is required')

  const admin = createAdminClient()
  const { error } = await admin.from('nexuses').update({ name: trimmed }).eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/nexuses/${slug}`)
  revalidatePath('/nexuses')
}
