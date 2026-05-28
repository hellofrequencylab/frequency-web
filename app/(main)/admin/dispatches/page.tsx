import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Megaphone } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DispatchesClient } from './dispatches-client'
import { BroadcastCompose } from '@/app/(main)/broadcast/broadcast-compose'

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

type AdminRole = 'host' | 'guide' | 'mentor' | 'janitor'
const ADMIN_ROLES: string[] = ['host', 'guide', 'mentor', 'janitor']

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

  if (!profile || !ADMIN_ROLES.includes(profile.community_role)) notFound()
  const role = profile.community_role as AdminRole

  // Fetch dispatches authored by this user
  const { data: dispatches } = await admin
    .from('dispatches')
    .select(`
      id, title, excerpt, dispatch_type, audience_scope, audience_id, status, published_at, scheduled_for, created_at,
      linked_task:crew_tasks!linked_task_id ( id, name )
    `)
    .eq('author_id', profile.id)
    .order('created_at', { ascending: false })

  // Audience options. Janitor gets everything; others scoped to their org
  let circles: { id: string; name: string }[] = []
  let hubs:    { id: string; name: string }[] = []
  let nexuses: { id: string; name: string }[] = []

  if (role === 'janitor') {
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

  const { data: tasks } = await admin
    .from('crew_tasks')
    .select('id, name')
    .order('name')

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Dispatches</h1>
          <p className="text-sm text-muted mt-1">
            Publish announcements to your community. Dispatches appear on the Broadcast page and drop into the main feed.
          </p>
        </div>
        <BroadcastCompose circles={circles} hubs={hubs} nexuses={nexuses} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2">
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
            role={role}
            circles={circles}
            hubs={hubs}
            nexuses={nexuses}
            tasks={tasks ?? []}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <SidebarCard title="Quick Actions">
            <div className="p-2 space-y-0.5">
              <Link href="/broadcast" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-text hover:bg-surface-elevated transition-colors">
                <Megaphone className="w-4 h-4 text-subtle" /> New Dispatch
              </Link>
            </div>
            <p className="px-4 py-3 text-xs text-subtle">Target dispatches to a specific circle, hub, or nexus. Published dispatches are visible to all members in the selected audience.</p>
          </SidebarCard>
        </div>
      </div>
    </div>
  )
}
