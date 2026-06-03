import { SidebarCard } from '@/components/ui/sidebar-card'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage } from '@/components/admin/admin-page'
import { NexusesClient } from './nexuses-client'
import { NewNexusCompose } from '@/components/compose/new-nexus-compose'


export default async function AdminNexusesPage() {
  await requireAdmin('mentor')

  const admin = createAdminClient()
  const { data: rawNexuses } = await admin
    .from('nexuses')
    .select(`id, name, status, member_cap, mentor_id,
             mentor:profiles!mentor_id ( id, display_name ),
             hubs ( id )`)
    .order('name')

  type RawNexusRow = {
    id: string; name: string; status: string; member_cap: number; mentor_id: string | null;
    mentor: { id: string; display_name: string } | null; hubs: { id: string }[];
  }
  const typedRawNexuses = (rawNexuses ?? []) as unknown as RawNexusRow[]
  const nexuses = typedRawNexuses.map((n) => ({
    ...n,
    _hub_count: n.hubs?.length ?? 0,
  }))

  const { data: mentors } = await admin
    .from('profiles')
    .select('id, display_name')
    .eq('community_role', 'mentor')
    .eq('is_active', true)
    .order('display_name')

  const { data: outposts } = await admin
    .from('outposts')
    .select('id, name')
    .order('name')

  return (
    <AdminPage
      title="Nexuses"
      eyebrow="Structure"
      description="Top-level geographic groupings. Each nexus contains hubs, which contain circles."
      actions={<NewNexusCompose outposts={outposts ?? []} />}
      width="default"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <NexusesClient nexuses={nexuses} mentors={mentors ?? []} />
        </div>
        <div className="space-y-4">
          <SidebarCard title="About Nexuses">
            <p className="px-4 py-3 text-xs text-subtle">Nexuses are the top-level grouping. Assign a mentor to oversee all hubs and circles within.</p>
          </SidebarCard>
        </div>
      </div>
    </AdminPage>
  )
}
