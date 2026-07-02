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

// ─── People (the 'people' spine module) ────────────────────────────────────────
// The hubs inside this nexus, the members behind each, and the mentor who leads them. Read
// re-resolves nexus.manage server-side (the admin client bypasses RLS, so THIS gate is the
// authority); returns null for anyone else. Reuses the SAME hubs-by-nexus read the nexus detail page
// runs (app/(main)/nexuses/[slug]/page.tsx).

export interface NexusHubRow {
  id: string
  name: string
  slug: string
  status: string
  guideName: string | null
  circleCount: number
  memberCount: number
}

export interface NexusPeopleData {
  nexusId: string
  slug: string
  mentorName: string | null
  mentorHandle: string | null
  hubCount: number
  totalMembers: number
  hubs: NexusHubRow[]
}

export async function getNexusPeopleData(slug: string): Promise<NexusPeopleData | null> {
  const admin = createAdminClient()
  const { data: nexus } = await admin
    .from('nexuses')
    .select('id, slug, mentor:profiles!mentor_id ( display_name, handle )')
    .eq('slug', slug)
    .maybeSingle()
  if (!nexus) return null

  const caps = await getNexusCapabilities(nexus.id)
  if (!caps.has('nexus.manage')) return null

  const { data: rawHubs } = await admin
    .from('hubs')
    .select('id, name, slug, status, guide:profiles!guide_id ( display_name ), circles ( member_count )')
    .eq('nexus_id', nexus.id)
    .order('name', { ascending: true })

  type Row = {
    id: string
    name: string
    slug: string
    status: string
    guide: { display_name: string | null } | null
    circles: { member_count: number | null }[]
  }
  const hubs: NexusHubRow[] = ((rawHubs ?? []) as unknown as Row[]).map((h) => ({
    id: h.id,
    name: h.name,
    slug: h.slug,
    status: h.status,
    guideName: h.guide?.display_name ?? null,
    circleCount: h.circles.length,
    memberCount: h.circles.reduce((s, c) => s + (c.member_count ?? 0), 0),
  }))
  const mentor = (nexus as unknown as { mentor: { display_name: string | null; handle: string | null } | null }).mentor

  return {
    nexusId: nexus.id,
    slug: nexus.slug,
    mentorName: mentor?.display_name ?? null,
    mentorHandle: mentor?.handle ?? null,
    hubCount: hubs.length,
    totalMembers: hubs.reduce((sum, h) => sum + h.memberCount, 0),
    hubs: hubs.slice(0, 8),
  }
}

// ─── Insights (the 'insights' spine module) ────────────────────────────────────
// The nexus rollup: members reached, hubs running, capacity fill, and the average per hub — the same
// numbers the detail page's scoped Insight band shows, gated on nexus.manage here.

export interface NexusInsightsData {
  totalMembers: number
  memberCap: number
  hubCount: number
  avgPerHub: number
}

export async function getNexusInsightsData(slug: string): Promise<NexusInsightsData | null> {
  const admin = createAdminClient()
  const { data: nexus } = await admin
    .from('nexuses')
    .select('id, member_cap, hubs ( circles ( member_count ) )')
    .eq('slug', slug)
    .maybeSingle()
  if (!nexus) return null

  const caps = await getNexusCapabilities(nexus.id)
  if (!caps.has('nexus.manage')) return null

  type Row = { member_cap: number; hubs: { circles: { member_count: number | null }[] }[] }
  const nx = nexus as unknown as Row
  const totalMembers = nx.hubs.reduce(
    (sum, h) => sum + h.circles.reduce((s, c) => s + (c.member_count ?? 0), 0),
    0,
  )
  return {
    totalMembers,
    memberCap: nx.member_cap,
    hubCount: nx.hubs.length,
    avgPerHub: nx.hubs.length > 0 ? Math.round(totalMembers / nx.hubs.length) : 0,
  }
}

// ─── Danger zone (the 'danger' spine module) ───────────────────────────────────
// Archive the nexus: set its status to 'archived' so it drops out of listings, leaving its hubs in
// place. Re-checks nexus.manage before writing. Reuse-only — the existing status column + gate.

export async function archiveNexus(id: string, slug: string): Promise<{ ok: true } | { error: string }> {
  const caps = await getNexusCapabilities(id)
  if (!caps.has('nexus.manage')) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { error } = await admin.from('nexuses').update({ status: 'archived' }).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(`/nexuses/${slug}`)
  revalidatePath('/nexuses')
  return { ok: true }
}
