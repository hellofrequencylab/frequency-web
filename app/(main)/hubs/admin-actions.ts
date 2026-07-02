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

// Field-level patch for the inline tuning layer (ADR-138). Allowlisted; re-checks
// hub.manage, same as the full settings form.
const INLINE_FIELDS = ['name'] as const
type InlineField = (typeof INLINE_FIELDS)[number]

export async function updateHubField(id: string, slug: string, field: InlineField, value: string) {
  if (!INLINE_FIELDS.includes(field)) throw new Error('Invalid field')

  const caps = await getHubCapabilities(id)
  if (!caps.has('hub.manage')) throw new Error('Unauthorized')

  const trimmed = value.trim()
  if (!trimmed) throw new Error('Name is required')

  const admin = createAdminClient()
  const { error } = await admin.from('hubs').update({ name: trimmed }).eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/hubs/${slug}`)
  revalidatePath('/hubs')
}

// ─── People (the 'people' spine module) ────────────────────────────────────────
// The circles inside this hub, how full each is, and the guide who leads them. Read re-resolves
// hub.manage server-side (the admin client bypasses RLS, so THIS gate — not RLS — is the authority);
// returns null for anyone else so the module renders nothing. Reuses the SAME circles-by-hub read the
// hub detail page runs (app/(main)/hubs/[slug]/page.tsx).

export interface HubCircleRow {
  id: string
  name: string
  slug: string
  status: string
  memberCount: number
  memberCap: number
  hostName: string | null
}

export interface HubPeopleData {
  hubId: string
  slug: string
  guideName: string | null
  guideHandle: string | null
  circleCount: number
  totalMembers: number
  circles: HubCircleRow[]
}

/** Load the circles + guide of a hub, but only for a viewer who may manage it. */
export async function getHubPeopleData(slug: string): Promise<HubPeopleData | null> {
  const admin = createAdminClient()
  const { data: hub } = await admin
    .from('hubs')
    .select('id, slug, guide:profiles!guide_id ( display_name, handle )')
    .eq('slug', slug)
    .maybeSingle()
  if (!hub) return null

  const caps = await getHubCapabilities(hub.id)
  if (!caps.has('hub.manage')) return null

  const { data: rawCircles } = await admin
    .from('circles')
    .select('id, name, slug, status, member_count, member_cap, host:profiles!host_id ( display_name )')
    .eq('hub_id', hub.id)
    .neq('status', 'archived')
    .order('name', { ascending: true })

  type Row = {
    id: string
    name: string
    slug: string
    status: string
    member_count: number
    member_cap: number
    host: { display_name: string | null } | null
  }
  const circles: HubCircleRow[] = ((rawCircles ?? []) as unknown as Row[]).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    status: c.status,
    memberCount: c.member_count,
    memberCap: c.member_cap,
    hostName: c.host?.display_name ?? null,
  }))
  const guide = (hub as unknown as { guide: { display_name: string | null; handle: string | null } | null }).guide

  return {
    hubId: hub.id,
    slug: hub.slug,
    guideName: guide?.display_name ?? null,
    guideHandle: guide?.handle ?? null,
    circleCount: circles.length,
    totalMembers: circles.reduce((sum, c) => sum + c.memberCount, 0),
    circles: circles.slice(0, 8),
  }
}

// ─── Insights (the 'insights' spine module) ────────────────────────────────────
// The hub rollup: members reached, circles running, and the average per circle — the same numbers the
// detail page's scoped Insight band shows, gated on hub.manage here (the module's own authority).

export interface HubInsightsData {
  totalMembers: number
  circleCount: number
  activeCircleCount: number
  avgPerCircle: number
}

export async function getHubInsightsData(slug: string): Promise<HubInsightsData | null> {
  const admin = createAdminClient()
  const { data: hub } = await admin.from('hubs').select('id').eq('slug', slug).maybeSingle()
  if (!hub) return null

  const caps = await getHubCapabilities(hub.id)
  if (!caps.has('hub.manage')) return null

  const { data: rawCircles } = await admin
    .from('circles')
    .select('member_count, status')
    .eq('hub_id', hub.id)
    .neq('status', 'archived')

  type Row = { member_count: number; status: string }
  const circles = (rawCircles ?? []) as Row[]
  const totalMembers = circles.reduce((sum, c) => sum + (c.member_count ?? 0), 0)
  const activeCircleCount = circles.filter((c) => c.status === 'active').length
  return {
    totalMembers,
    circleCount: circles.length,
    activeCircleCount,
    avgPerCircle: circles.length > 0 ? Math.round(totalMembers / circles.length) : 0,
  }
}

// ─── Danger zone (the 'danger' spine module) ───────────────────────────────────
// Archive the hub: set its status to 'archived' so it drops out of listings, leaving its circles in
// place. Re-checks hub.manage before writing (capabilities are law; the admin client bypasses RLS).
// Reuse-only — the existing status column + gate, no delete cascade, no migration.

export async function archiveHub(id: string, slug: string): Promise<{ ok: true } | { error: string }> {
  const caps = await getHubCapabilities(id)
  if (!caps.has('hub.manage')) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { error } = await admin.from('hubs').update({ status: 'archived' }).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(`/hubs/${slug}`)
  revalidatePath('/hubs')
  return { ok: true }
}
