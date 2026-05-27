import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CirclesClient } from './circles-client'

type CommunityRole = 'host' | 'guide' | 'mentor' | 'janitor'

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

  if (!profile || !['host', 'guide', 'mentor', 'janitor'].includes(profile.community_role)) notFound()

  const role = profile.community_role as CommunityRole

  // Fetch circles scoped to role
  let circles: any[] = []

  if (role === 'janitor') {
    // Mega-admin: all circles
    const { data } = await admin
      .from('circles')
      .select(`id, name, about, type, status, member_count, member_cap, hub_id, host_id,
               hub:hubs!hub_id ( id, name ),
               host:profiles!host_id ( id, display_name )`)
      .order('name')
    circles = data ?? []
  } else if (role === 'host') {
    const { data } = await admin
      .from('circles')
      .select(`id, name, about, type, status, member_count, member_cap, hub_id, host_id,
               hub:hubs!hub_id ( id, name ),
               host:profiles!host_id ( id, display_name )`)
      .eq('host_id', profile.id)
      .order('name')
    circles = data ?? []
  } else if (role === 'guide') {
    const { data: hubs } = await admin.from('hubs').select('id').eq('guide_id', profile.id)
    const hubIds = (hubs ?? []).map((h: any) => h.id)
    if (hubIds.length > 0) {
      const { data } = await admin
        .from('circles')
        .select(`id, name, about, type, status, member_count, member_cap, hub_id, host_id,
                 hub:hubs!hub_id ( id, name ),
                 host:profiles!host_id ( id, display_name )`)
        .in('hub_id', hubIds)
        .order('name')
      circles = data ?? []
    }
  } else {
    // mentor — all circles across their nexuses
    const { data: nexuses } = await admin.from('nexuses').select('id').eq('mentor_id', profile.id)
    const nexusIds = (nexuses ?? []).map((n: any) => n.id)
    if (nexusIds.length > 0) {
      const { data: hubs } = await admin.from('hubs').select('id').in('nexus_id', nexusIds)
      const hubIds = (hubs ?? []).map((h: any) => h.id)
      if (hubIds.length > 0) {
        const { data } = await admin
          .from('circles')
          .select(`id, name, about, type, status, member_count, member_cap, hub_id, host_id,
                   hub:hubs!hub_id ( id, name ),
                   host:profiles!host_id ( id, display_name )`)
          .in('hub_id', hubIds)
          .order('name')
        circles = data ?? []
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
    <div className="px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Circles</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Create and manage circles within your scope. Each circle needs a hub assignment to appear in the hierarchy.
        </p>
      </div>

      <CirclesClient
        circles={circles as any}
        hubs={hubs}
        hosts={hostProfiles ?? []}
      />
    </div>
  )
}
