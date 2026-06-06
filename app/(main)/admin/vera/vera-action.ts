'use server'

import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { getVeraAdminData } from './load-vera'

// In-place "Manage Vera" loader (ADR-149 — Platform). Janitor only (the /admin/vera
// page gate). Returns null otherwise; saveVera / refreshFeatured / vetoFeatured re-check
// their own authorization.
export async function loadVeraAdmin() {
  const profile = await getCallerProfile()
  if (!profile?.community_role || !atLeastRole(profile.community_role, 'janitor')) return null
  return getVeraAdminData()
}
