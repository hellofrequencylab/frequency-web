import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Users } from 'lucide-react'
import { MemberAdmin } from './member-admin'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

export default async function AdminMembersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: caller } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!caller || caller.community_role !== 'janitor') notFound()

  const { data: members } = await admin
    .from('profiles')
    .select(`
      id,
      auth_user_id,
      display_name,
      handle,
      avatar_url,
      bio,
      community_role,
      is_active,
      created_at,
      current_season_rank,
      current_season_zaps,
      nexus_regions!nexus_region_id ( name )
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  const allMembers = (members ?? []).map((m: any) => ({
    ...m,
    regionName: m.nexus_regions?.name ?? null,
  }))

  // Get emails for all members
  const emailMap: Record<string, string> = {}
  for (const m of allMembers) {
    if (m.auth_user_id) {
      try {
        const { data: { user: authUser } } = await admin.auth.admin.getUserById(m.auth_user_id)
        if (authUser?.email) emailMap[m.id] = authUser.email
      } catch { /* skip */ }
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-5 h-5 text-primary-strong" />
            <h1 className="text-2xl font-bold text-text">Members</h1>
          </div>
          <p className="text-sm text-muted">{allMembers.length} total members</p>
        </div>
      </div>

      <MemberAdmin members={allMembers} emailMap={emailMap} />
    </div>
  )
}
