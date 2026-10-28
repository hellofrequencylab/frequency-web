// The rows behind the launch done-checks (VLS-02). One small read per noun, by the Space, under the member's own session (RLS), so a schema change
// to any of them degrades to "not yet" instead of throwing (the lib/onboarding/status.ts rule). Server-only.

import { createClient } from '@/lib/supabase/server'
import { getConnectStatus } from '@/lib/billing/connect'
import type { LaunchRows } from './done-checks'

export async function loadLaunchRows(spaceId: string, ownerProfileId: string): Promise<LaunchRows | null> {
  const db = await createClient()
  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> => {
    const res = await q
    return res.error ? 0 : (res.count ?? 0)
  }
  const [spaceRes, eventCount, circleCount, journeyCount, contactCount, connect] = await Promise.all([
    db.from('spaces').select('preferences, tagline, about').eq('id', spaceId).maybeSingle(),
    count(db.from('events').select('id', { count: 'exact', head: true }).or(`space_id.eq.${spaceId},host_space_id.eq.${spaceId}`).eq('is_cancelled', false).is('removed_at', null)),
    count(db.from('circles').select('id', { count: 'exact', head: true }).eq('space_id', spaceId).eq('is_space_primary', false)),
    count(db.from('journey_plans').select('id', { count: 'exact', head: true }).eq('space_id', spaceId)),
    count(db.from('contacts').select('id', { count: 'exact', head: true }).eq('space_id', spaceId)),
    getConnectStatus(ownerProfileId).catch(() => null),
  ])
  const space = spaceRes.data as { preferences: unknown; tagline: string | null; about: string | null } | null
  if (!space) return null
  return {
    preferences: space.preferences,
    tagline: space.tagline,
    about: space.about,
    eventCount,
    circleCount,
    journeyCount,
    contactCount,
    payoutsReady: connect?.ready === true,
  }
}
