import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { HubsClient } from './hubs-client'
import { NewHubCompose } from '@/components/compose/new-hub-compose'

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{title}</h3>
      </div>
      {children}
    </div>
  )
}

export default async function AdminHubsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile || !['guide', 'mentor', 'janitor'].includes(profile.community_role)) notFound()

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
    <div>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Hubs</h1>
          <p className="text-sm text-muted mt-1">
            Hubs group circles within a nexus. Assign a guide to each hub.
          </p>
        </div>
        <NewHubCompose nexuses={nexuses ?? []} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <HubsClient hubs={hubs} nexuses={nexuses ?? []} guides={guides ?? []} />
        </div>
        <div className="space-y-4">
          <SidebarCard title="About Hubs">
            <p className="px-4 py-3 text-xs text-subtle">Each hub is contained within a nexus and groups multiple circles. Assign a guide to oversee the hub.</p>
          </SidebarCard>
        </div>
      </div>
    </div>
  )
}
