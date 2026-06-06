import { createAdminClient } from '@/lib/supabase/admin'
import type { CommunityRole } from '@/lib/core/roles'

// Role-scoped Broadcasts data — dispatch list + the audience options (circles / hubs
// / nexuses the caller may target) + crew tasks. Shared by the in-place Broadcasts
// module (ADR-138 Comms); mirrors the /admin/dispatches page load (which should adopt
// this to DRY — follow-up).

type Named = { id: string; name: string }

type DispatchRow = {
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
}

export type BroadcastsData = {
  dispatches: DispatchRow[]
  circles: Named[]
  hubs: Named[]
  nexuses: Named[]
  tasks: Named[]
}

export async function getBroadcastsData(profileId: string, role: CommunityRole): Promise<BroadcastsData> {
  const admin = createAdminClient()
  const isStaff = role === 'janitor' || role === 'admin'

  let dispatchQuery = admin
    .from('dispatches')
    .select(
      `id, title, excerpt, dispatch_type, audience_scope, audience_id, status, published_at, scheduled_for, created_at,
       linked_task:crew_tasks!linked_task_id ( id, name )`,
    )
    .order('created_at', { ascending: false })
  if (!isStaff) dispatchQuery = dispatchQuery.eq('author_id', profileId)
  const { data: dispatches } = await dispatchQuery

  let circles: Named[] = []
  let hubs: Named[] = []
  let nexuses: Named[] = []

  if (role === 'janitor' || role === 'admin') {
    const [cRes, hRes, nRes] = await Promise.all([
      admin.from('circles').select('id, name').order('name'),
      admin.from('hubs').select('id, name').order('name'),
      admin.from('nexuses').select('id, name').order('name'),
    ])
    circles = cRes.data ?? []
    hubs = hRes.data ?? []
    nexuses = nRes.data ?? []
  } else if (role === 'host') {
    const { data } = await admin.from('circles').select('id, name').eq('host_id', profileId).order('name')
    circles = data ?? []
  } else if (role === 'guide') {
    const { data: h } = await admin.from('hubs').select('id, name').eq('guide_id', profileId).order('name')
    hubs = h ?? []
    if (hubs.length > 0) {
      const { data: c } = await admin.from('circles').select('id, name').in('hub_id', hubs.map((x) => x.id)).order('name')
      circles = c ?? []
    }
  } else {
    const { data: nx } = await admin.from('nexuses').select('id, name').eq('mentor_id', profileId).order('name')
    nexuses = nx ?? []
    if (nexuses.length > 0) {
      const { data: h } = await admin.from('hubs').select('id, name').in('nexus_id', nexuses.map((n) => n.id)).order('name')
      hubs = h ?? []
      if (hubs.length > 0) {
        const { data: c } = await admin.from('circles').select('id, name').in('hub_id', hubs.map((x) => x.id)).order('name')
        circles = c ?? []
      }
    }
  }

  const { data: tasks } = await admin.from('crew_tasks').select('id, name').order('name')

  return {
    dispatches: (dispatches ?? []) as unknown as DispatchRow[],
    circles,
    hubs,
    nexuses,
    tasks: tasks ?? [],
  }
}
