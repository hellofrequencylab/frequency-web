import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { isStaff as isStaffAxis } from '@/lib/core/roles'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { DispatchesClient } from './dispatches-client'
import { BroadcastCompose } from '@/app/(main)/broadcast/broadcast-compose'

export default async function AdminDispatchesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { profileId, role, webRole } = await requireAdmin('host', { staff: 'community' })
  const { edit } = await searchParams
  const admin = createAdminClient()
  // Staff standing is the STAFF axis (web_role, ADR-208), NOT the deprecated
  // community_role admin/janitor rungs — so a Site Admin with community_role 'member'
  // is correctly treated as staff (full broadcast list + full audience).
  const isStaff = isStaffAxis(webRole)

  // Staff (admin/janitor) see + manage every broadcast (so the "Edit broadcast"
  // button on any broadcast lands here); everyone else sees only their own.
  let dispatchQuery = admin
    .from('dispatches')
    .select(`
      id, title, body, excerpt, dispatch_type, audience_scope, audience_id, status, published_at, scheduled_for, created_at,
      linked_task:crew_tasks!linked_task_id ( id, name )
    `)
    .order('created_at', { ascending: false })
  if (!isStaff) dispatchQuery = dispatchQuery.eq('author_id', profileId)
  const { data: dispatches } = await dispatchQuery

  // Audience options. Janitor gets everything; others scoped to their org
  let circles: { id: string; name: string }[] = []
  let hubs:    { id: string; name: string }[] = []
  let nexuses: { id: string; name: string }[] = []

  if (isStaff) {
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
    <AdminTemplate
      title="Dispatches"
      eyebrow="Community"
      description="Publish announcements to your community. Dispatches appear on the Dispatches page and drop into the main feed."
      actions={<BroadcastCompose circles={circles} hubs={hubs} nexuses={nexuses} />}
      width="default"
    >
      <AdminSection>
        <DispatchesClient
          dispatches={(dispatches ?? []) as unknown as Array<{
            id: string
            title: string
            body: string | null
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
          initialEditId={edit ?? null}
        />
      </AdminSection>
    </AdminTemplate>
  )
}
