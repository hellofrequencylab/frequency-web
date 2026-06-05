import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { CirclesClient } from './circles-client'
import { NewCircleCompose } from '@/components/compose/new-circle-compose'

export default async function AdminCirclesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>
}) {
  const { edit } = await searchParams
  const { profileId, role } = await requireAdmin('host', { staff: 'community' })
  const admin = createAdminClient()

  // Fetch circles scoped to role
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

  let circles: CircleRow[] = []

  if (role === 'janitor' || role === 'admin') {
    // Mega-admin: all circles
    const { data } = await admin
      .from('circles')
      .select(`id, name, about, type, status, member_count, member_cap, hub_id, host_id,
               hub:hubs!hub_id ( id, name ),
               host:profiles!host_id ( id, display_name )`)
      .order('name')
    circles = (data ?? []) as unknown as CircleRow[]
  } else if (role === 'host') {
    const { data } = await admin
      .from('circles')
      .select(`id, name, about, type, status, member_count, member_cap, hub_id, host_id,
               hub:hubs!hub_id ( id, name ),
               host:profiles!host_id ( id, display_name )`)
      .eq('host_id', profileId)
      .order('name')
    circles = (data ?? []) as unknown as CircleRow[]
  } else if (role === 'guide') {
    const { data: hubs } = await admin.from('hubs').select('id').eq('guide_id', profileId)
    const hubIds = (hubs ?? []).map((h: { id: string }) => h.id)
    if (hubIds.length > 0) {
      const { data } = await admin
        .from('circles')
        .select(`id, name, about, type, status, member_count, member_cap, hub_id, host_id,
                 hub:hubs!hub_id ( id, name ),
                 host:profiles!host_id ( id, display_name )`)
        .in('hub_id', hubIds)
        .order('name')
      circles = (data ?? []) as unknown as CircleRow[]
    }
  } else {
    // mentor. All circles across their nexuses
    const { data: nexuses } = await admin.from('nexuses').select('id').eq('mentor_id', profileId)
    const nexusIds = (nexuses ?? []).map((n: { id: string }) => n.id)
    if (nexusIds.length > 0) {
      const { data: hubs } = await admin.from('hubs').select('id').in('nexus_id', nexusIds)
      const hubIds = (hubs ?? []).map((h: { id: string }) => h.id)
      if (hubIds.length > 0) {
        const { data } = await admin
          .from('circles')
          .select(`id, name, about, type, status, member_count, member_cap, hub_id, host_id,
                   hub:hubs!hub_id ( id, name ),
                   host:profiles!host_id ( id, display_name )`)
          .in('hub_id', hubIds)
          .order('name')
        circles = (data ?? []) as unknown as CircleRow[]
      }
    }
  }

  // Hubs for the create form dropdown
  let hubs: { id: string; name: string }[] = []
  if (role === 'guide' || role === 'mentor') {
    const { data } = await admin.from('hubs').select('id, name').order('name')
    hubs = data ?? []
  } else {
    const { data } = await admin.from('hubs').select('id, name').order('name')
    hubs = data ?? []
  }

  // Host options (crew+ profiles for assigning)
  const { data: hostProfiles } = await admin
    .from('profiles')
    .select('id, display_name')
    .in('community_role', ['host', 'guide', 'mentor', 'janitor'])
    .eq('is_active', true)
    .order('display_name')

  return (
    <AdminPage
      title="Circles"
      eyebrow="Community"
      description="Create and manage circles within your scope. Each circle needs a hub assignment to appear in the hierarchy."
      actions={<NewCircleCompose hubs={hubs} />}
      width="wide"
    >
      <AdminSection>
        <CirclesClient circles={circles} hubs={hubs} hosts={hostProfiles ?? []} initialEditId={edit ?? null} />
      </AdminSection>
    </AdminPage>
  )
}
