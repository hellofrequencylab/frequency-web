import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminSection } from '@/components/templates'
import { HubsClient } from '@/app/(main)/admin/hubs/hubs-client'

// Admin Hubs layout module (ADR-270/294): the hub roster — the editable table of every hub with its
// nexus, guide, circle count, and status, plus the "no hubs yet" first-use empty. A self-fetching
// RSC: it reads the hubs, the nexus options (the edit form's dropdown), and the guide options itself,
// so the page hands it nothing. The ?edit=<id> deep-link (the "Edit hub" button on a hub page) is a
// searchParams facet a nested module never receives as a prop, so it's read from the x-search request
// header the proxy stamps (proxy.ts) — the same seam the admin practices library uses. The page keeps
// its guide + structure-staff gate; this renders only through that gated route, so it never re-gates.

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

export async function AdminHubsRoster() {
  const admin = createAdminClient()

  const [{ data: rawHubs }, { data: nexuses }, { data: guides }] = await Promise.all([
    admin
      .from('hubs')
      .select(`id, name, status, nexus_id, guide_id,
               nexus:nexuses!nexus_id ( id, name ),
               guide:profiles!guide_id ( id, display_name ),
               circles ( id )`)
      .order('name'),
    admin.from('nexuses').select('id, name').order('name'),
    admin
      .from('profiles')
      .select('id, display_name')
      .in('community_role', ['guide', 'mentor'])
      .eq('is_active', true)
      .order('display_name'),
  ])

  const typedRawHubs = (rawHubs ?? []) as unknown as RawHubRow[]
  const hubs = typedRawHubs.map((h) => ({
    ...h,
    _circle_count: h.circles?.length ?? 0,
  }))

  // The ?edit=<id> deep-link is a page searchParams facet a nested module never gets as a prop; read
  // it from the x-search header the proxy stamps on every route (the admin-practices-library seam).
  const editId = new URLSearchParams((await headers()).get('x-search') ?? '').get('edit') || null

  return (
    <AdminSection>
      <HubsClient hubs={hubs} nexuses={nexuses ?? []} guides={guides ?? []} initialEditId={editId} />
    </AdminSection>
  )
}
