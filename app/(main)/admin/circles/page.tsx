import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CirclesClient } from './circles-client'
import { NewCircleCompose } from '@/components/compose/new-circle-compose'

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

type CommunityRole = 'host' | 'guide' | 'mentor' | 'admin' | 'janitor'

export default async function AdminCirclesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile || !['host', 'guide', 'mentor', 'janitor'].includes(profile.community_role ?? '')) notFound()

  const role = profile.community_role as CommunityRole

  // Fetch circles scoped to role
  type CircleRow = {
    id: string
    name: string
    about: string | null
    type: string
    status: string
    member_count: number
    member_cap: number
    hub_id: string | null
    host_id: string | null
    hub: { id: string; name: string } | null
    host: { id: string; display_name: string } | null
  }

  let circles: CircleRow[] = []

  if (role === 'janitor' || role === 'admin') {
    // Mega-admin: all circles
    const { data } = await admin
      .from('circles')
      .select(`id, name, about, type, status, member_count, member_cap, hub_id, host_id,
               hub:hubs!hub_id ( id, name ),
               host:profiles!host_id ( id, display_name )`)
      .order('name')
    circles = (data ?? []) as unknown as CircleRow[]
  } else if (role === 'host') {
    const { data } = await admin
      .from('circles')
      .select(`id, name, about, type, status, member_count, member_cap, hub_id, host_id,
               hub:hubs!hub_id ( id, name ),
               host:profiles!host_id ( id, display_name )`)
      .eq('host_id', profile.id)
      .order('name')
    circles = (data ?? []) as unknown as CircleRow[]
  } else if (role === 'guide') {
    const { data: hubs } = await admin.from('hubs').select('id').eq('guide_id', profile.id)
    const hubIds = (hubs ?? []).map((h: { id: string }) => h.id)
    if (hubIds.length > 0) {
      const { data } = await admin
        .from('circles')
        .select(`id, name, about, type, status, member_count, member_cap, hub_id, host_id,
                 hub:hubs!hub_id ( id, name ),
                 host:profiles!host_id ( id, display_name )`)
        .in('hub_id', hubIds)
        .order('name')
      circles = (data ?? []) as unknown as CircleRow[]
    }
  } else {
    // mentor. All circles across their nexuses
    const { data: nexuses } = await admin.from('nexuses').select('id').eq('mentor_id', profile.id)
    const nexusIds = (nexuses ?? []).map((n: { id: string }) => n.id)
    if (nexusIds.length > 0) {
      const { data: hubs } = await admin.from('hubs').select('id').in('nexus_id', nexusIds)
      const hubIds = (hubs ?? []).map((h: { id: string }) => h.id)
      if (hubIds.length > 0) {
        const { data } = await admin
          .from('circles')
          .select(`id, name, about, type, status, member_count, member_cap, hub_id, host_id,
                   hub:hubs!hub_id ( id, name ),
                   host:profiles!host_id ( id, display_name )`)
          .in('hub_id', hubIds)
          .order('name')
        circles = (data ?? []) as unknown as CircleRow[]
      }
    }
  }

  // Hubs for the create form dropdown
  let hubs: { id: string; name: string }[] = []
  if (role === 'guide' || role === 'mentor') {
    const { data } = await admin.from('hubs').select('id, name').order('name')
    hubs = data ?? []
  } else {
    const { data } = await admin.from('hubs').select('id, name').order('name')
    hubs = data ?? []
  }

  // Host options (crew+ profiles for assigning)
  const { data: hostProfiles } = await admin
    .from('profiles')
    .select('id, display_name')
    .in('community_role', ['host', 'guide', 'mentor', 'janitor'])
    .eq('is_active', true)
    .order('display_name')

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Circles</h1>
          <p className="text-sm text-muted mt-1">
            Create and manage circles within your scope. Each circle needs a hub assignment to appear in the hierarchy.
          </p>
        </div>
        <NewCircleCompose hubs={hubs} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2">
          <CirclesClient
            circles={circles}
            hubs={hubs}
            hosts={hostProfiles ?? []}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <SidebarCard title="Quick Actions">
            <div className="p-2 space-y-0.5">
              <Link href="/circles/new" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-text hover:bg-surface-elevated transition-colors">
                <Plus className="w-4 h-4 text-subtle" /> New Circle
              </Link>
              <Link href="/admin/hubs" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-text hover:bg-surface-elevated transition-colors">
                <Plus className="w-4 h-4 text-subtle" /> Manage Hubs
              </Link>
            </div>
            <hr className="border-border" />
            <p className="px-4 py-3 text-xs text-subtle">Archiving hides a circle from discovery but preserves all data.</p>
          </SidebarCard>
        </div>
      </div>
    </div>
  )
}
