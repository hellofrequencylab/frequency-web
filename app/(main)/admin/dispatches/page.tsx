import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DispatchesClient } from './dispatches-client'

type CommunityRole = 'host' | 'guide' | 'mentor'

export default async function AdminDispatchesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile || !['host', 'guide', 'mentor'].includes(profile.community_role)) notFound()
  const role = profile.community_role as CommunityRole

  // Fetch dispatches authored by this user
  const { data: dispatches } = await admin
    .from('dispatches')
    .select(`
      id, title, excerpt, audience_scope, audience_id, status, published_at, created_at,
      linked_task:crew_tasks!linked_task_id ( id, name )
    `)
    .eq('author_id', profile.id)
    .order('created_at', { ascending: false })

  // Audience options based on role
  let circles: { id: string; name: string }[] = []
  let hubs:    { id: string; name: string }[] = []
  let nexuses: { id: string; name: string }[] = []

  if (role === 'host') {
    const { data } = await admin.from('circles').select('id, name').eq('host_id', profile.id).order('name')
    circles = data ?? []
  } else if (role === 'guide') {
    const { data: h } = await admin.from('hubs').select('id, name').eq('guide_id', profile.id).order('name')
    hubs = h ?? []
    if (hubs.length > 0) {
      const { data: c } = await admin.from('circles').select('id, name').in('hub_id', hubs.map(h => h.id)).order('name')
      circles = c ?? []
    }
  } else {
    // mentor
    const { data: nx } = await admin.from('nexuses').select('id, name').eq('mentor_id', profile.id).order('name')
    nexuses = nx ?? []
    if (nexuses.length > 0) {
      const { data: h } = await admin.from('hubs').select('id, name').in('nexus_id', nexuses.map(n => n.id)).order('name')
      hubs = h ?? []
      if (hubs.length > 0) {
        const { data: c } = await admin.from('circles').select('id, name').in('hub_id', hubs.map(h => h.id)).order('name')
        circles = c ?? []
      }
    }
  }

  // Tasks for linking
  const { data: tasks } = await admin
    .from('crew_tasks')
    .select('id, name')
    .order('name')

  return (
    <div className="px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Dispatches</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Publish announcements to your community. Dispatches appear on the Broadcast page and drop a card into the main feed.
        </p>
      </div>

      <DispatchesClient
        dispatches={(dispatches ?? []) as any}
        role={role}
        circles={circles}
        hubs={hubs}
        nexuses={nexuses}
        tasks={tasks ?? []}
      />
    </div>
  )
}
