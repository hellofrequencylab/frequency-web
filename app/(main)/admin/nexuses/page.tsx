import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NexusesClient } from './nexuses-client'
import { NewNexusCompose } from '@/components/compose/new-nexus-compose'

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
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Nexuses</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Top-level geographic groupings. Each nexus contains hubs, which contain circles.
          </p>
        </div>
        <NewNexusCompose />
      </div>
      <NexusesClient nexuses={nexuses} mentors={mentors ?? []} />
    </div>
  )
}
