// North-Star read-models, computed off the one event backbone (engagement_events).
// WAP = Weekly Active Practitioners (distinct members with a verified practice in a
// rolling 7 days); activation = first verified practice within N days of joining.
// See docs/COMMS-CRM-ARCHITECTURE.md §0 + ADR-024/025. Server-only.

import { createAdminClient } from '@/lib/supabase/admin'

const PRACTICE_EVENT = 'practice.verified'
const DAY = 24 * 60 * 60 * 1000
const ACTIVATION_WINDOW_DAYS = 7

export interface PracticeMetrics {
  /** Distinct members with >=1 verified practice in the last 7 days. */
  wap: number
  /** Total verified practices in the last 7 days. */
  verifiedThisWeek: number
  /** Members who joined in the last 30 days. */
  newMembers: number
  /** Of those, how many logged a verified practice within N days of joining. */
  activated: number
  /** activated / newMembers (0..1). */
  activationRate: number
}

export async function getPracticeMetrics(): Promise<PracticeMetrics> {
  const admin = createAdminClient()
  const now = Date.now()
  const weekAgo = new Date(now - 7 * DAY).toISOString()
  const monthAgo = new Date(now - 30 * DAY).toISOString()

  // Verified practices in the last 7 days → WAP (distinct actors) + volume.
  const { data: weekRows } = await admin
    .from('engagement_events')
    .select('actor_profile_id')
    .eq('event_type', PRACTICE_EVENT)
    .gte('created_at', weekAgo)

  const verifiedThisWeek = weekRows?.length ?? 0
  const wap = new Set(
    (weekRows ?? []).map((r) => r.actor_profile_id).filter((id): id is string => !!id),
  ).size

  // Activation: of members who joined in the last 30 days, how many logged a
  // verified practice within N days of joining.
  const { data: newProfiles } = await admin
    .from('profiles')
    .select('id, created_at')
    .gte('created_at', monthAgo)

  const newMembers = newProfiles?.length ?? 0
  let activated = 0

  if (newProfiles && newProfiles.length > 0) {
    const ids = newProfiles.map((p) => p.id)
    const { data: practices } = await admin
      .from('engagement_events')
      .select('actor_profile_id, created_at')
      .eq('event_type', PRACTICE_EVENT)
      .in('actor_profile_id', ids)

    // Earliest verified practice per actor.
    const firstByActor = new Map<string, number>()
    for (const ev of practices ?? []) {
      if (!ev.actor_profile_id || !ev.created_at) continue
      const t = new Date(ev.created_at).getTime()
      const prev = firstByActor.get(ev.actor_profile_id)
      if (prev === undefined || t < prev) firstByActor.set(ev.actor_profile_id, t)
    }

    for (const p of newProfiles) {
      if (!p.created_at) continue
      const first = firstByActor.get(p.id)
      if (first !== undefined && first - new Date(p.created_at).getTime() <= ACTIVATION_WINDOW_DAYS * DAY) {
        activated++
      }
    }
  }

  return {
    wap,
    verifiedThisWeek,
    newMembers,
    activated,
    activationRate: newMembers > 0 ? activated / newMembers : 0,
  }
}
