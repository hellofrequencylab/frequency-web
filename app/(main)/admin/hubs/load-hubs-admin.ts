import { createAdminClient } from '@/lib/supabase/admin'

// "Manage all hubs" data for the in-place Spaces·Hubs module (ADR-138). Mirrors the
// /admin/hubs page load (which can adopt this to DRY).
export async function getHubsAdminData() {
  const admin = createAdminClient()

  const { data: rawHubs } = await admin
    .from('hubs')
    .select(
      `id, name, status, nexus_id, guide_id,
       nexus:nexuses!nexus_id ( id, name ),
       guide:profiles!guide_id ( id, display_name ),
       circles ( id )`,
    )
    .order('name')

  type RawHubRow = {
    id: string
    name: string
    status: string
    nexus_id: string | null
    guide_id: string | null
    nexus: { id: string; name: string } | null
    guide: { id: string; display_name: string } | null
    circles: { id: string }[]
  }
  const hubs = ((rawHubs ?? []) as unknown as RawHubRow[]).map((h) => ({ ...h, _circle_count: h.circles?.length ?? 0 }))

  const { data: nexuses } = await admin.from('nexuses').select('id, name').order('name')
  const { data: guides } = await admin
    .from('profiles')
    .select('id, display_name')
    .in('community_role', ['guide', 'mentor'])
    .eq('is_active', true)
    .order('display_name')

  return { hubs, nexuses: nexuses ?? [], guides: guides ?? [] }
}
