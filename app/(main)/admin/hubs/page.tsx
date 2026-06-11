import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { HubsClient } from './hubs-client'
import { NewHubCompose } from '@/components/compose/new-hub-compose'


export default async function AdminHubsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireAdmin('guide', { staff: 'structure' })
  const { edit } = await searchParams

  const admin = createAdminClient()
  const { data: rawHubs } = await admin
    .from('hubs')
    .select(`id, name, status, nexus_id, guide_id,
             nexus:nexuses!nexus_id ( id, name ),
             guide:profiles!guide_id ( id, display_name ),
             circles ( id )`)
    .order('name')

  type RawHubRow = {
    id: string; name: string; status: string; nexus_id: string | null; guide_id: string | null;
    nexus: { id: string; name: string } | null; guide: { id: string; display_name: string } | null;
    circles: { id: string }[];
  }
  const typedRawHubs = (rawHubs ?? []) as unknown as RawHubRow[]
  const hubs = typedRawHubs.map((h) => ({
    ...h,
    _circle_count: h.circles?.length ?? 0,
  }))

  const { data: nexuses } = await admin
    .from('nexuses')
    .select('id, name')
    .order('name')

  const { data: guides } = await admin
    .from('profiles')
    .select('id, display_name')
    .in('community_role', ['guide', 'mentor'])
    .eq('is_active', true)
    .order('display_name')

  return (
    <AdminTemplate
      title="Hubs"
      eyebrow="Structure"
      description="Hubs group circles within a nexus. Each hub is contained within a nexus and groups multiple circles. Assign a guide to oversee each hub."
      actions={<NewHubCompose nexuses={nexuses ?? []} />}
      width="wide"
    >
      <AdminSection>
        <HubsClient hubs={hubs} nexuses={nexuses ?? []} guides={guides ?? []} initialEditId={edit ?? null} />
      </AdminSection>
    </AdminTemplate>
  )
}
