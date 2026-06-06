'use server'

import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { getRolesData } from './load-roles'

// In-place Roles module loader (ADR-138 — People). Janitor-only, like /admin/roles
// (`requireAdmin('janitor')`). Returns null otherwise; the assign-role / staff-role /
// permission-grid actions re-check their own authorization.
export async function loadRoles() {
  const profile = await getCallerProfile()
  if (!profile?.community_role || !atLeastRole(profile.community_role, 'janitor')) return null
  return getRolesData()
}
