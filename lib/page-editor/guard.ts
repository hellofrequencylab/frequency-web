import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStaffMember, staffCan } from '@/lib/staff'
import { atLeastRole, type CommunityRole } from '@/lib/core/roles'

// Marketing-page management is gated to the `janitor` community role (the top
// community admin), separate from the Studio staff system. One place so the
// directory, the editor route, and the publish/draft actions stay in sync.

export async function getJanitor(): Promise<{ profileId: string } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!data || data.community_role !== 'janitor') return null
  return { profileId: data.id as string }
}

export async function requireJanitor(): Promise<{ profileId: string }> {
  const janitor = await getJanitor()
  if (!janitor) throw new Error('Forbidden: janitor role required')
  return janitor
}

// Growth Studio (now the home for the disbanded Marketing suite, IA §10.2) is
// reachable by community admin/janitor OR a staff role with the 'marketing'
// capability — the same gate the marketing workspace carried, so no one loses
// access when the standalone Marketing nav item retires.
export async function canAccessGrowthStudio(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const role = ((data?.community_role as CommunityRole) ?? 'member')
  if (atLeastRole(role, 'admin')) return true

  const staff = await getStaffMember().catch(() => null)
  return !!staff && staffCan(staff.role, 'marketing', 'read')
}
