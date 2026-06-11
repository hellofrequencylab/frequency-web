// North-Star read-models, computed off the one event backbone (engagement_events).
// WAM = Weekly Active Members (distinct members with a verified practice in a
// rolling 7 days); activation = first verified practice within N days of joining.
// See docs/COMMS-CRM-ARCHITECTURE.md §0 + ADR-024/025. Server-only.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'

const PRACTICE_EVENT = 'practice.verified'
const DAY = 24 * 60 * 60 * 1000
const ACTIVATION_WINDOW_DAYS = 7

export interface PracticeMetrics {
  /** Distinct members with >=1 verified practice in the last 7 days. */
  wam: number
  /** Total verified practices in the last 7 days. */
  verifiedThisWeek: number
  /** Members who joined in the last 30 days. */
  newMembers: number
  /** Of those, how many logged a verified practice within N days of joining. */
  activated: number
  /** activated / newMembers (0..1). */
  activationRate: number
}

async function computePracticeMetrics(): Promise<PracticeMetrics> {
  const admin = createAdminClient()
  const now = Date.now()
  const weekAgo = new Date(now - 7 * DAY).toISOString()
  const monthAgo = new Date(now - 30 * DAY).toISOString()

  // Verified practices in the last 7 days → WAM (distinct actors) + volume.
  const { data: weekRows } = await admin
    .from('engagement_events')
    .select('actor_profile_id')
    .eq('event_type', PRACTICE_EVENT)
    .gte('created_at', weekAgo)

  const verifiedThisWeek = weekRows?.length ?? 0
  const wam = new Set(
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
    wam,
    verifiedThisWeek,
    newMembers,
    activated,
    activationRate: newMembers > 0 ? activated / newMembers : 0,
  }
}

// Request-scoped memo: several dashboard sections read these metrics in the same
// render; cache() collapses them to a single DB sweep per request.
export const getPracticeMetrics = cache(computePracticeMetrics)

const WEEK = 7 * DAY

export interface RetentionCohort {
  /** ISO date (YYYY-MM-DD) of the cohort's first week (Monday, UTC). */
  weekStart: string
  /** Members whose first verified practice fell in that week. */
  size: number
  /** Percent of the cohort still active each subsequent week: [w0=100, w1, w2, ...]. */
  retention: number[]
}

// Monday-based week start (UTC) for a timestamp.
function weekStartUTC(ms: number): number {
  const d = new Date(ms)
  const dayFromMonday = (d.getUTCDay() + 6) % 7
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dayFromMonday * DAY
}

/**
 * Weekly practice-retention cohorts: of the members whose first verified practice was in
 * week W, what share practiced again in W+1, W+2, ... The core PMF signal. Windowed to the
 * last `weeks` weeks; computed off the engagement ledger.
 */
export async function getPracticeRetention(weeks = 8): Promise<RetentionCohort[]> {
  const admin = createAdminClient()
  const since = new Date(weekStartUTC(Date.now()) - (weeks - 1) * WEEK).toISOString()

  const { data } = await admin
    .from('engagement_events')
    .select('actor_profile_id, created_at')
    .eq('event_type', PRACTICE_EVENT)
    .gte('created_at', since)

  // actor -> set of week-start timestamps they practiced
  const actorWeeks = new Map<string, Set<number>>()
  for (const ev of data ?? []) {
    if (!ev.actor_profile_id || !ev.created_at) continue
    const w = weekStartUTC(new Date(ev.created_at).getTime())
    let set = actorWeeks.get(ev.actor_profile_id)
    if (!set) {
      set = new Set<number>()
      actorWeeks.set(ev.actor_profile_id, set)
    }
    set.add(w)
  }

  // cohort = the actor's earliest active week within the window
  const cohorts = new Map<number, string[]>()
  for (const [actor, set] of actorWeeks) {
    const first = Math.min(...set)
    const arr = cohorts.get(first)
    if (arr) arr.push(actor)
    else cohorts.set(first, [actor])
  }

  const thisWeek = weekStartUTC(Date.now())
  return [...cohorts.keys()]
    .sort((a, b) => a - b)
    .map((cw) => {
      const actors = cohorts.get(cw) as string[]
      const size = actors.length
      const maxOffset = Math.round((thisWeek - cw) / WEEK)
      const retention: number[] = []
      for (let off = 0; off <= maxOffset; off++) {
        const wk = cw + off * WEEK
        const active = actors.filter((a) => actorWeeks.get(a)?.has(wk)).length
        retention.push(Math.round((active / size) * 100))
      }
      return { weekStart: new Date(cw).toISOString().slice(0, 10), size, retention }
    })
}
