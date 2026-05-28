import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NexusesClient } from './nexuses-client'
import { NewNexusCompose } from '@/components/compose/new-nexus-compose'

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100/80 dark:border-gray-800/50">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{title}</h3>
      </div>
      {children}
    </div>
  )
}

export default async function AdminNexusesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile || !['mentor', 'janitor'].includes(profile.community_role as string)) notFound()

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

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Nexuses</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Top-level geographic groupings. Each nexus contains hubs, which contain circles.
          </p>
        </div>
        <NewNexusCompose />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <NexusesClient nexuses={nexuses} mentors={mentors ?? []} />
        </div>
        <div className="space-y-4">
          <SidebarCard title="About Nexuses">
            <p className="px-4 py-3 text-xs text-gray-400">Nexuses are the top-level grouping. Assign a mentor to oversee all hubs and circles within.</p>
          </SidebarCard>
        </div>
      </div>
    </div>
  )
}
