import { createAdminClient } from '@/lib/supabase/admin'

// "Manage all nexuses" data for the in-place Spaces·Nexuses module (ADR-138). Mirrors
// the /admin/nexuses page load (which can adopt this to DRY).
export async function getNexusesAdminData() {
  const admin = createAdminClient()

  const { data: rawNexuses } = await admin
    .from('nexuses')
    .select(
      `id, name, status, member_cap, mentor_id,
       mentor:profiles!mentor_id ( id, display_name ),
       hubs ( id )`,
    )
    .order('name')

  type RawNexusRow = {
    id: string
    name: string
    status: string
    member_cap: number
    mentor_id: string | null
    mentor: { id: string; display_name: string } | null
    hubs: { id: string }[]
  }
  const nexuses = ((rawNexuses ?? []) as unknown as RawNexusRow[]).map((n) => ({ ...n, _hub_count: n.hubs?.length ?? 0 }))

  const { data: mentors } = await admin
    .from('profiles')
    .select('id, display_name')
    .eq('community_role', 'mentor')
    .eq('is_active', true)
    .order('display_name')

  const { data: outposts } = await admin.from('outposts').select('id, name').order('name')

  return { nexuses, mentors: mentors ?? [], outposts: outposts ?? [] }
}
