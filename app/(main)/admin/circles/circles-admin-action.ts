'use server'

import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { getCirclesAdminData } from './load-circles-admin'

// In-place "manage all circles" loader (ADR-138 — Spaces). Host+ (the /admin/circles
// page gate); role-scoped inside the loader. Returns null otherwise; the create/edit/
// archive actions re-check their own authorization.
export async function loadCirclesAdmin() {
  const profile = await getCallerProfile()
  if (!profile?.community_role || !atLeastRole(profile.community_role, 'host')) return null
  return getCirclesAdminData(profile.id, profile.community_role)
}
