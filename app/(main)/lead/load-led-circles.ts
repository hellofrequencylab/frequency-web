import { createAdminClient } from '@/lib/supabase/admin'
import type { CommunityRole } from '@/lib/core/roles'

// "Circles you lead" for the Leader dashboard. This MIRRORS the exact scoping of
// the /admin/circles per-role query (app/(main)/admin/circles/page.tsx ~L42-82) so
// a leader only ever sees the circles within THEIR reach — never platform-wide:
//   • host   → circles where host_id = me
//   • guide  → circles in the hubs I guide (hubs.guide_id = me)
//   • mentor → circles in the hubs under the nexuses I mentor (nexuses.mentor_id = me)
// There is no "all circles" branch here (that lived only in the staff/janitor arm of
// the admin page, which /lead never reaches — /lead is a community-ladder surface).
// Every query is keyed to `profileId`, so there is no unscoped read.

export type LedCircle = {
  id: string
  name: string
  slug: string
  about: string | null
  type: string
  status: string
  member_count: number
  hub: { id: string; name: string } | null
}

const SELECT = `id, name, slug, about, type, status, member_count, hub_id, host_id,
                hub:hubs!hub_id ( id, name )`

export async function getLedCircles(role: CommunityRole, profileId: string): Promise<LedCircle[]> {
  const admin = createAdminClient()

  if (role === 'host') {
    const { data } = await admin
      .from('circles')
      .select(SELECT)
      .eq('host_id', profileId)
      .order('name')
    return (data ?? []) as unknown as LedCircle[]
  }

  if (role === 'guide') {
    const { data: hubs } = await admin.from('hubs').select('id').eq('guide_id', profileId)
    const hubIds = (hubs ?? []).map((h: { id: string }) => h.id)
    if (hubIds.length === 0) return []
    const { data } = await admin
      .from('circles')
      .select(SELECT)
      .in('hub_id', hubIds)
      .order('name')
    return (data ?? []) as unknown as LedCircle[]
  }

  if (role === 'mentor') {
    const { data: nexuses } = await admin.from('nexuses').select('id').eq('mentor_id', profileId)
    const nexusIds = (nexuses ?? []).map((n: { id: string }) => n.id)
    if (nexusIds.length === 0) return []
    const { data: hubs } = await admin.from('hubs').select('id').in('nexus_id', nexusIds)
    const hubIds = (hubs ?? []).map((h: { id: string }) => h.id)
    if (hubIds.length === 0) return []
    const { data } = await admin
      .from('circles')
      .select(SELECT)
      .in('hub_id', hubIds)
      .order('name')
    return (data ?? []) as unknown as LedCircle[]
  }

  // Any other rung (member/crew, or the deprecated admin/janitor enum values) leads
  // nothing on the COMMUNITY ladder, so there is nothing scoped to return.
  return []
}

// ── The networks under a leader (the Leadership dashboard, ADR-266) ──────────────────
// "Networks under them" = the hubs a GUIDE stewards and the nexuses a MENTOR stewards.
// Both are scoped strictly to `profileId` (guide_id / mentor_id = me) — never platform-wide,
// matching the getLedCircles scoping above. A plain host steward leads no network → [].

export type LedHub = { id: string; name: string; slug: string; circle_count: number }
export type LedNexus = { id: string; name: string; slug: string; hub_count: number }

/** Hubs this profile GUIDES (hubs.guide_id = me), each with its circle count. */
export async function getLedHubs(profileId: string): Promise<LedHub[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('hubs').select('id, name, slug').eq('guide_id', profileId).order('name')
  const hubs = (data ?? []) as { id: string; name: string; slug: string }[]
  if (hubs.length === 0) return []
  const ids = hubs.map((h) => h.id)
  const { data: circleRows } = await admin.from('circles').select('hub_id').in('hub_id', ids)
  const counts = new Map<string, number>()
  for (const r of (circleRows ?? []) as { hub_id: string | null }[]) {
    if (r.hub_id) counts.set(r.hub_id, (counts.get(r.hub_id) ?? 0) + 1)
  }
  return hubs.map((h) => ({ ...h, circle_count: counts.get(h.id) ?? 0 }))
}

/** Nexuses this profile MENTORS (nexuses.mentor_id = me), each with its hub count. */
export async function getLedNexuses(profileId: string): Promise<LedNexus[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('nexuses').select('id, name, slug').eq('mentor_id', profileId).order('name')
  const nexuses = (data ?? []) as { id: string; name: string; slug: string }[]
  if (nexuses.length === 0) return []
  const ids = nexuses.map((n) => n.id)
  const { data: hubRows } = await admin.from('hubs').select('nexus_id').in('nexus_id', ids)
  const counts = new Map<string, number>()
  for (const r of (hubRows ?? []) as { nexus_id: string | null }[]) {
    if (r.nexus_id) counts.set(r.nexus_id, (counts.get(r.nexus_id) ?? 0) + 1)
  }
  return nexuses.map((n) => ({ ...n, hub_count: counts.get(n.id) ?? 0 }))
}
