'use server'

import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { getEventsAdminData } from './load-events'

// In-place "manage events" loader (ADR-138 — Spaces). Host+ (the /admin/events page
// gate); scoped to the caller inside the loader. Returns null otherwise; the
// cancel/reinstate action re-checks its own authorization.
export async function loadEventsAdmin() {
  const profile = await getCallerProfile()
  if (!profile?.community_role || !atLeastRole(profile.community_role, 'host')) return null
  return getEventsAdminData(profile.id)
}
