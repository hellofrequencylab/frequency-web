'use server'

import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { getGamificationData, type GamificationData } from './load-gamification'

// In-place Gamification module loader (ADR-138 — the Engage surface). Returns the
// stat summary + control data only to host+ operators; null otherwise. The season /
// award / reward-config actions re-check their own authorization.
export async function loadGamification(): Promise<({ isJanitor: boolean } & GamificationData) | null> {
  const profile = await getCallerProfile()
  if (!profile?.community_role || !atLeastRole(profile.community_role, 'host')) return null
  const isJanitor = profile.community_role === 'janitor'
  const data = await getGamificationData(isJanitor)
  return { isJanitor, ...data }
}
