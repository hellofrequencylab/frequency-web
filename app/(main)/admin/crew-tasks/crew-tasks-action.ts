'use server'

import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { getCrewTasksAdminData } from './load-crew-tasks'

// In-place "define & verify crew tasks" loader (ADR-138 — Engage). Host+ (the
// /admin/crew-tasks page gate). Returns null otherwise; the update/delete/verify
// actions in ../actions re-check their own auth.
export async function loadCrewTasksAdmin() {
  const profile = await getCallerProfile()
  if (!profile?.community_role || !atLeastRole(profile.community_role, 'host')) return null
  return getCrewTasksAdminData()
}
