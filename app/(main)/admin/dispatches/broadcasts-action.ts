'use server'

import { getCallerProfile } from '@/lib/auth'
import { atLeastRole, type CommunityRole } from '@/lib/core/roles'
import { getBroadcastsData, type BroadcastsData } from './load-broadcasts'

// In-place Broadcasts module loader (ADR-138 — the Comms surface). Returns the
// role-scoped composer audience + dispatch list only to host+ operators; null
// otherwise. The compose/edit/publish actions live in the broadcast/dispatch action
// files and re-check their own authorization.
export async function loadBroadcasts(): Promise<({ role: CommunityRole } & BroadcastsData) | null> {
  const profile = await getCallerProfile()
  if (!profile?.community_role || !atLeastRole(profile.community_role, 'host')) return null
  const data = await getBroadcastsData(profile.id, profile.community_role)
  return { role: profile.community_role, ...data }
}
