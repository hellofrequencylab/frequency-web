import { createAdminClient } from '@/lib/supabase/admin'
import type { CommunityRole } from '@/lib/core/roles'

// Role-scoped "manage all circles" data for the in-place Spaces·Circles module
// (ADR-138). Mirrors the /admin/circles page load (which can adopt this to DRY).

const SELECT = `id, name, about, type, status, member_count, member_cap, hub_id, host_id,
  hub:hubs!hub_id ( id, name ),
  host:profiles!host_id ( id, display_name )`

type CircleRow = {
  id: string
  name: string
  about: string | null
  type: string
  status: string
  member_count: number
  member_cap: number
  hub_id: string | null
  host_id: string | null
  hub: { id: string; name: string } | null
  host: { id: string; display_name: string } | null
}

export async function getCirclesAdminData(profileId: string, role: CommunityRole) {
  const admin = createAdminClient()
  let circles: CircleRow[] = []

  if (role === 'janitor' || role === 'admin') {
    const { data } = await admin.from('circles').select(SELECT).order('name')
    circles = (data ?? []) as unknown as CircleRow[]
  } else if (role === 'host') {
    const { data } = await admin.from('circles').select(SELECT).eq('host_id', profileId).order('name')
    circles = (data ?? []) as unknown as CircleRow[]
  } else if (role === 'guide') {
    const { data: hubs } = await admin.from('hubs').select('id').eq('guide_id', profileId)
    const hubIds = (hubs ?? []).map((h: { id: string }) => h.id)
    if (hubIds.length > 0) {
      const { data } = await admin.from('circles').select(SELECT).in('hub_id', hubIds).order('name')
      circles = (data ?? []) as unknown as CircleRow[]
    }
  } else {
    const { data: nexuses } = await admin.from('nexuses').select('id').eq('mentor_id', profileId)
    const nexusIds = (nexuses ?? []).map((n: { id: string }) => n.id)
    if (nexusIds.length > 0) {
      const { data: hubs } = await admin.from('hubs').select('id').in('nexus_id', nexusIds)
      const hubIds = (hubs ?? []).map((h: { id: string }) => h.id)
      if (hubIds.length > 0) {
        const { data } = await admin.from('circles').select(SELECT).in('hub_id', hubIds).order('name')
        circles = (data ?? []) as unknown as CircleRow[]
      }
    }
  }

  const { data: hubsData } = await admin.from('hubs').select('id, name').order('name')
  const { data: hostProfiles } = await admin
    .from('profiles')
    .select('id, display_name')
    .in('community_role', ['host', 'guide', 'mentor', 'janitor'])
    .eq('is_active', true)
    .order('display_name')

  return { circles, hubs: hubsData ?? [], hosts: hostProfiles ?? [] }
}
