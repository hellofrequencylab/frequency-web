import { cache } from 'react'
import { getCallerProfile } from '@/lib/auth'
import type { CommunityRole } from '@/lib/core/roles'

// The live viewer's EFFECTIVE community role for per-module role gating (ADR-271). getCallerProfile
// already applies "view as" (a steward previewing a lower role sees what that role sees) and is
// request-cached, so this is a thin, fail-safe wrapper. FAIL-CLOSED to 'member' (the most
// restricted signed-in rung) so a lookup miss can never reveal a role-gated module.
export const getViewerCommunityRole = cache(async (): Promise<CommunityRole> => {
  try {
    const profile = await getCallerProfile()
    return (profile?.community_role ?? 'member') as CommunityRole
  } catch {
    return 'member'
  }
})
