// Engagement dashboard read-models (ADR-070 Phase B). Aggregates the event ledger
// for the janitor dashboard via the engagement_* RPCs + the existing WAM read-model.
// Server-only. The funnel math is pure + unit-tested. RPCs aren't in database.types
// (cast, repo convention).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPracticeMetrics, type PracticeMetrics } from './practice'

export interface EventTypeCount {
  eventType: string
  events: number
  actors: number
}
export interface PropCount {
  value: string
  n: number
}
export interface FunnelStep {
  step: string
  eventType: string
  actors: number
  /** % lost vs the previous step (null for the first step). */
  dropPct: number | null
}
export interface EngagementDashboard {
  windowDays: number
  practice: PracticeMetrics
  byType: EventTypeCount[]
  topPages: PropCount[]
  topFeatures: PropCount[]
  funnel: FunnelStep[]
}

const FUNNEL: ReadonlyArray<{ step: string; eventType: string }> = [
  { step: 'Viewed a page', eventType: 'nav.page_view' },
  { step: 'Used a feature', eventType: 'feature.used' },
  { step: 'Adopted a practice', eventType: 'practice.adopted' },
  { step: 'Verified a practice', eventType: 'practice.verified' },
]

/** Pure: attach step-over-step drop-off to an ordered list of (step, actors). */
export function computeFunnel(steps: ReadonlyArray<{ step: string; eventType: string; actors: number }>): FunnelStep[] {
  return steps.map((s, i) => {
    const prev = i === 0 ? null : steps[i - 1].actors
    const dropPct = prev && prev > 0 ? Math.round((1 - s.actors / prev) * 100) : null
    return { ...s, dropPct }
  })
}

function mapProps(data: unknown): PropCount[] {
  return ((data ?? []) as Array<{ value: string | null; n: number }>)
    .filter((r) => r.value !== null)
    .map((r) => ({ value: r.value as string, n: Number(r.n) }))
}

export async function getEngagementDashboard(windowDays = 30): Promise<EngagementDashboard> {
  const db = createAdminClient() as unknown as SupabaseClient
  const [practice, byTypeRes, pagesRes, featuresRes] = await Promise.all([
    getPracticeMetrics(),
    db.rpc('engagement_event_counts', { _days: windowDays }),
    db.rpc('engagement_prop_counts', { _event: 'nav.page_view', _prop: 'path', _days: windowDays, _limit: 10 }),
    db.rpc('engagement_prop_counts', { _event: 'feature.used', _prop: 'feature', _days: windowDays, _limit: 10 }),
  ])

  const byType = ((byTypeRes.data ?? []) as Array<{ event_type: string; events: number; actors: number }>).map((r) => ({
    eventType: r.event_type,
    events: Number(r.events),
    actors: Number(r.actors),
  }))
  const actorsFor = (et: string) => byType.find((b) => b.eventType === et)?.actors ?? 0
  const funnel = computeFunnel(FUNNEL.map((s) => ({ ...s, actors: actorsFor(s.eventType) })))

  return {
    windowDays,
    practice,
    byType,
    topPages: mapProps(pagesRes.data),
    topFeatures: mapProps(featuresRes.data),
    funnel,
  }
}
