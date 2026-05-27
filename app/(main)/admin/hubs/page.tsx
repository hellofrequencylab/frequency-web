import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { HubsClient } from './hubs-client'

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

  if (!profile || !['guide', 'mentor'].includes(profile.community_role)) notFound()

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
    <div className="px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Hubs</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Hubs group circles within a nexus. Assign a guide to each hub.
        </p>
      </div>
      <HubsClient hubs={hubs} nexuses={nexuses ?? []} guides={guides ?? []} />
    </div>
  )
}
