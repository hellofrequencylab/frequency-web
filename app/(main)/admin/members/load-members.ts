import { createAdminClient } from '@/lib/supabase/admin'

// Member roster + resolved emails for the in-place Members module (ADR-138 — People).
// Mirrors the /admin/members "Members" tab (which can adopt this to DRY); the
// subscribers / beta tabs stay on the page (linked from the module).

export type MemberRow = {
  id: string
  auth_user_id: string | null
  display_name: string
  handle: string
  avatar_url: string | null
  bio: string | null
  community_role: string
  is_active: boolean | null
  created_at: string | null
  current_season_rank: string | null
  current_season_zaps: number | null
  regionName: string | null
}

export async function getMembersData(): Promise<{ members: MemberRow[]; emailMap: Record<string, string> }> {
  const admin = createAdminClient()

  const { data: members } = await admin
    .from('profiles')
    .select(
      `id, auth_user_id, display_name, handle, avatar_url, bio, community_role,
       is_active, created_at, current_season_rank, current_season_zaps,
       nexus_regions!nexus_region_id ( name )`,
    )
    .eq('is_system', false)
    .order('created_at', { ascending: false })
    .limit(200)

  const allMembers: MemberRow[] = (members ?? []).map((m) => ({
    id: m.id,
    auth_user_id: m.auth_user_id,
    display_name: m.display_name,
    handle: m.handle,
    avatar_url: m.avatar_url,
    bio: m.bio,
    community_role: m.community_role ?? 'member',
    is_active: m.is_active,
    created_at: m.created_at,
    current_season_rank: m.current_season_rank,
    current_season_zaps: m.current_season_zaps,
    regionName: (m.nexus_regions as { name: string } | null)?.name ?? null,
  }))

  // Resolve emails by paging through auth users (a few listUsers calls) rather than
  // one getUserById per member.
  const emailByAuthId: Record<string, string> = {}
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    const users = data?.users ?? []
    for (const u of users) if (u.email) emailByAuthId[u.id] = u.email
    if (error || users.length < 1000) break
  }
  const emailMap: Record<string, string> = {}
  for (const m of allMembers) {
    if (m.auth_user_id && emailByAuthId[m.auth_user_id]) emailMap[m.id] = emailByAuthId[m.auth_user_id]
  }

  return { members: allMembers, emailMap }
}
