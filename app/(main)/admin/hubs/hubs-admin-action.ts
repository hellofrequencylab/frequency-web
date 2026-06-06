'use server'

import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { getHubsAdminData } from './load-hubs-admin'

// In-place "manage all hubs" loader (ADR-138 — Spaces). Guide+ (the /admin/hubs page
// gate). Returns null otherwise; the create/edit actions re-check their own auth.
export async function loadHubsAdmin() {
  const profile = await getCallerProfile()
  if (!profile?.community_role || !atLeastRole(profile.community_role, 'guide')) return null
  return getHubsAdminData()
}
