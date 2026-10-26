import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAvailable } from '@/lib/spaces/functions'

/** Parent tenancy wall for privileged Circle reads. Circle access is an additional gate,
 * never a substitute for the owning Space's visibility and module switch. */
export const canReadCircleParentSpace = cache(async (spaceId: string | null, viewerProfileId: string | null): Promise<boolean> => {
  // Legacy unpartitioned Circles have no owning Space, matching can_view_space_content.
  if (!spaceId) return true
  try {
    const { data, error } = await createAdminClient().from('spaces')
      .select('id, visibility, status, owner_profile_id, entitlements').eq('id', spaceId).maybeSingle()
    if (error || !data || data.status !== 'active') return false
    if (data.visibility !== null && data.visibility !== 'network' && data.visibility !== 'private') return false
    const space = { id: data.id, ownerProfileId: data.owner_profile_id, entitlements: data.entitlements }
    const enabled = spaceFunctionAvailable(space, 'circles')
    if (data.visibility !== 'private' && enabled) return true
    const caps = await getSpaceCapabilities(space, viewerProfileId)
    // Active viewers can see a private Space; only writers/staff can read a disabled module.
    if (data.visibility === 'private' && !caps.role) return false
    return enabled || caps.canEditProfile
  } catch {
    return false
  }
})
