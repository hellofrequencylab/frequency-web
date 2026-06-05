import { SidebarCard } from '@/components/ui/sidebar-card'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage } from '@/components/admin/admin-page'
import { HubsClient } from './hubs-client'
import { NewHubCompose } from '@/components/compose/new-hub-compose'


export default async function AdminHubsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireAdmin('guide')
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
    <AdminPage
      title="Hubs"
      eyebrow="Structure"
      description="Hubs group circles within a nexus. Assign a guide to each hub."
      actions={<NewHubCompose nexuses={nexuses ?? []} />}
      width="default"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <HubsClient hubs={hubs} nexuses={nexuses ?? []} guides={guides ?? []} initialEditId={edit ?? null} />
        </div>
        <div className="space-y-4">
          <SidebarCard title="About Hubs">
            <p className="px-4 py-3 text-xs text-subtle">Each hub is contained within a nexus and groups multiple circles. Assign a guide to oversee the hub.</p>
          </SidebarCard>
        </div>
      </div>
    </AdminPage>
  )
}
