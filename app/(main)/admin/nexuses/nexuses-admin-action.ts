'use server'

import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { getNexusesAdminData } from './load-nexuses-admin'

// In-place "manage all nexuses" loader (ADR-138 — Spaces). Mentor+ (the /admin/nexuses
// page gate). Returns null otherwise; the create/edit actions re-check their own auth.
export async function loadNexusesAdmin() {
  const profile = await getCallerProfile()
  if (!profile?.community_role || !atLeastRole(profile.community_role, 'mentor')) return null
  return getNexusesAdminData()
}
