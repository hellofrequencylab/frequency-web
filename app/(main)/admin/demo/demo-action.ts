'use server'

import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { getDemoData } from './load-demo'

// In-place Demo module loader (ADR-138 — Platform). Janitor-only, like /admin/demo
// (`requireAdmin('janitor')`). Returns null otherwise; the generate / grow / purge
// actions re-check their own authorization.
export async function loadDemo() {
  const profile = await getCallerProfile()
  if (!profile?.community_role || !atLeastRole(profile.community_role, 'janitor')) return null
  return getDemoData()
}
