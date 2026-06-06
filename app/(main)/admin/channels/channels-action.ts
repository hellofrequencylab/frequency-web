'use server'

import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { getChannelsAdminData } from './load-channels'

// In-place "manage channels" loader (ADR-138 — Spaces). Host+ (the /admin/channels
// page gate); scoped to the caller inside the loader. Returns null otherwise; the
// archive action re-checks its own authorization.
export async function loadChannelsAdmin() {
  const profile = await getCallerProfile()
  if (!profile?.community_role || !atLeastRole(profile.community_role, 'host')) return null
  return getChannelsAdminData(profile.id)
}
