import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
