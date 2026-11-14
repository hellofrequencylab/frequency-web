// THE CREATE A SPACE FUNNEL (LIVE-1970): the read-model the admin Insights page shows, from the nine signals
// (lib/create-space/signal.ts) and the launch's own events. PURE: the counts come in (lib/analytics/dashboard.ts
// reads them through the engagement_event_counts RPC) and the funnel comes out, so the math is a table of cases.
//
// Two kinds of count on purpose. The builder's steps are anonymous (one row per tab and event), so they count
// VISITS, from `events`. The last two are the launch's, which has an account, so they count MEMBERS, from `actors`,
// and they count every door into the launch, not only this one; the captions say so. The median name-to-saved time
// is read from create_space_drafts (first letter to hand-over) and is the only ground the "12 minutes" claim may
// stand on: no claim until a median exists.

import type { FunnelStep } from '@/lib/analytics/dashboard'

interface Count {
  eventType: string
  events: number
  actors: number
}

const STEPS: ReadonlyArray<{ step: string; eventType: string; count: 'events' | 'actors' }> = [
  { step: 'Opened the builder', eventType: 'createspace.view', count: 'events' },
  { step: 'Typed a name', eventType: 'createspace.name_started', count: 'events' },
  { step: 'Picked an accent', eventType: 'createspace.accent_picked', count: 'events' },
  { step: 'Mocked up the offer', eventType: 'createspace.offer', count: 'events' },
  { step: 'Saved to an address', eventType: 'createspace.lead', count: 'events' },
  { step: 'Finished photos', eventType: 'createspace.photos', count: 'events' },
  { step: 'Started the launch (every door)', eventType: 'launch_started', count: 'actors' },
  { step: 'Launched (every door)', eventType: 'launch_completed', count: 'actors' },
]

/** Independent builder-visit and signed-in launch activity for the window, without inferred conversion. */
export function createSpaceFunnel(byType: readonly Count[]): FunnelStep[] {
  const of = (et: string, kind: 'events' | 'actors') => byType.find((c) => c.eventType === et)?.[kind] ?? 0
  // Anonymous visits and signed-in members are separate populations. Even within
  // one population these window totals do not prove ordered cohort conversion.
  return STEPS.map((s) => ({
    step: s.step,
    eventType: s.eventType,
    actors: of(s.eventType, s.count),
    dropPct: null,
  }))
}

/** The median of a list, or null for an empty one. Total. */
export function median(samples: readonly number[]): number | null {
  const s = samples.filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (s.length === 0) return null
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** The milliseconds from the first letter to the hand-over, for the drafts that were handed over. A row with no
 *  start, or a hand-over before its start, is left out. Total. */
export function nameToSavedMs(rows: ReadonlyArray<{ started_at: string | null; converted_at: string | null }>): number[] {
  const out: number[] = []
  for (const r of rows) {
    if (!r.started_at || !r.converted_at) continue
    const ms = Date.parse(r.converted_at) - Date.parse(r.started_at)
    if (Number.isFinite(ms) && ms >= 0) out.push(ms)
  }
  return out
}

/** "11 min", "48 sec", or "no draft handed over yet". */
export function formatMedian(ms: number | null): string {
  if (ms === null) return 'no draft handed over yet'
  if (ms < 60_000) return `${Math.round(ms / 1000)} sec`
  return `${Math.round(ms / 60_000)} min`
}
