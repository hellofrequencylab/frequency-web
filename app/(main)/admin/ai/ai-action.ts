'use server'

import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { getAiControlsData } from './load-ai'

// In-place "AI controls" loader (ADR-149 — Platform). Janitor only (the /admin/ai
// page gate). Returns null otherwise; the toggle / reindex actions re-check their own
// authorization.
export async function loadAiControls() {
  const profile = await getCallerProfile()
  if (!profile?.community_role || !atLeastRole(profile.community_role, 'janitor')) return null
  return getAiControlsData()
}
