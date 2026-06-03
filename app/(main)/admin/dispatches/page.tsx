import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { DispatchesClient } from './dispatches-client'
import { BroadcastCompose } from '@/app/(main)/broadcast/broadcast-compose'

export default async function AdminDispatchesPage() {
  const { profileId, role } = await requireAdmin('host')
  const admin = createAdminClient()

  // Fetch dispatches authored by this user
  const { data: dispatches } = await admin
    .from('dispatches')
    .select(`
      id, title, excerpt, dispatch_type, audience_scope, audience_id, status, published_at, scheduled_for, created_at,
      linked_task:crew_tasks!linked_task_id ( id, name )
    `)
    .eq('author_id', profileId)
    .order('created_at', { ascending: false })

  // Audience options. Janitor gets everything; others scoped to their org
  let circles: { id: string; name: string }[] = []
  let hubs:    { id: string; name: string }[] = []
  let nexuses: { id: string; name: string }[] = []

  if (role === 'janitor' || role === 'admin') {
    // Mega-admin: all circles, hubs, nexuses
    const [cRes, hRes, nRes] = await Promise.all([
      admin.from('circles').select('id, name').order('name'),
      admin.from('hubs').select('id, name').order('name'),
      admin.from('nexuses').select('id, name').order('name'),
    ])
    circles = cRes.data ?? []
    hubs    = hRes.data ?? []
    nexuses = nRes.data ?? []
  } else if (role === 'host') {
    const { data } = await admin.from('circles').select('id, name').eq('host_id', profileId).order('name')
    circles = data ?? []
  } else if (role === 'guide') {
    const { data: h } = await admin.from('hubs').select('id, name').eq('guide_id', profileId).order('name')
    hubs = h ?? []
    if (hubs.length > 0) {
      const { data: c } = await admin.from('circles').select('id, name').in('hub_id', hubs.map(h => h.id)).order('name')
      circles = c ?? []
    }
  } else {
    // mentor
    const { data: nx } = await admin.from('nexuses').select('id, name').eq('mentor_id', profileId).order('name')
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

  const { data: tasks } = await admin
    .from('crew_tasks')
    .select('id, name')
    .order('name')

  return (
    <AdminPage
      title="Broadcasts"
      eyebrow="Community"
      description="Publish announcements to your community. Broadcasts appear on the Broadcasts page and drop into the main feed."
      actions={<BroadcastCompose circles={circles} hubs={hubs} nexuses={nexuses} />}
      width="default"
    >
      <AdminSection>
        <DispatchesClient
          dispatches={(dispatches ?? []) as unknown as Array<{
            id: string
            title: string
            excerpt: string | null
            dispatch_type: 'post' | 'poll' | 'challenge' | 'article'
            audience_scope: 'circle' | 'hub' | 'nexus'
            audience_id: string
            status: 'draft' | 'published'
            published_at: string | null
            scheduled_for: string | null
            created_at: string
            linked_task: { id: string; name: string } | null
          }>}
          role={role as 'host' | 'guide' | 'mentor' | 'admin' | 'janitor'}
          circles={circles}
          hubs={hubs}
          nexuses={nexuses}
          tasks={tasks ?? []}
        />
      </AdminSection>
    </AdminPage>
  )
}
