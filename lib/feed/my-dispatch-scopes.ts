// The Dispatch reach the signed-in member leads (LIVE-682), for a composer mount to offer.
// The offer only: createPost re-reads the profile and re-checks the pick against the same rule.

import { getCallerProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { isStaff } from '@/lib/core/roles'
import { dispatchScopesFor, type DispatchScope } from './compose-kinds'

export async function getMyDispatchScopes(): Promise<DispatchScope[]> {
  const me = await getCallerProfile()
  if (!me) return []
  const staff = isStaff(me.webRole)
  const base = dispatchScopesFor({ communityRole: me.community_role, isStaff: staff, hasRegion: false })
  if (base.length === 0) return []
  // Only a Mentor or staff can reach the Nexus, and only with a region to reach.
  const wide = dispatchScopesFor({ communityRole: me.community_role, isStaff: staff, hasRegion: true })
  if (wide.length === base.length) return base
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('nexus_region_id').eq('id', me.id).maybeSingle()
  return data?.nexus_region_id ? wide : base
}
