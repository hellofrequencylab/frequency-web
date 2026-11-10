// Reads the rows behind FlowWeb's region numbers (LIVE-2235) with the service role and computes them.
// Shared by the staff CSV download (/admin/growth/flowweb-metrics) and FlowWeb's signed outcomes pull
// (/api/webhooks/flowweb-outcomes, LIVE-2255). Service role because the counts span every member's events
// and last-seen time, which RLS scopes to the viewer's own region. Returns only the four totals per region.
// FAIL-LOUD: a failed read answers { error }, never zeros, because FlowWeb would read zeros as a region
// going cold.

import type { createAdminClient } from '@/lib/supabase/admin'
import { chosenAreaOf, computeRegionMetrics, type MetricEvent } from './region-metrics'

type Admin = ReturnType<typeof createAdminClient>
type RegionMetrics = ReturnType<typeof computeRegionMetrics>

const DAY = 86_400_000
const ROW_CAP = 20_000

export async function loadRegionMetrics(admin: Admin, now: Date): Promise<{ rows: RegionMetrics } | { error: string }> {
  const from = new Date(now.getTime() - 28 * DAY).toISOString()
  const to = new Date(now.getTime() + 14 * DAY).toISOString()
  const seenSince = new Date(now.getTime() - 7 * DAY).toISOString()

  const [evRes, memRes] = await Promise.all([
    admin
      .from('events')
      .select('starts_at, host_id, city, category, scope_circle_id')
      .eq('status', 'published')
      .eq('is_cancelled', false)
      .eq('is_demo', false)
      .is('removed_at', null)
      .gte('starts_at', from)
      .lte('starts_at', to)
      .limit(ROW_CAP),
    admin
      .from('profiles')
      .select('city, meta')
      .eq('is_demo', false)
      .gte('last_seen_at', seenSince)
      .limit(ROW_CAP),
  ])
  if (evRes.error || memRes.error) return { error: evRes.error?.message ?? memRes.error?.message ?? 'read failed' }

  const events = evRes.data ?? []
  const circleIds = [...new Set(events.map((e) => e.scope_circle_id).filter((x): x is string => !!x))]
  const hostIds = [...new Set(events.map((e) => e.host_id).filter((x): x is string => !!x))]
  const [circRes, hostRes] = await Promise.all([
    circleIds.length
      ? admin.from('circles').select('id, topical_channel_id').in('id', circleIds)
      : Promise.resolve({ data: [], error: null }),
    hostIds.length
      ? admin.from('profiles').select('id, meta').in('id', hostIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (circRes.error || hostRes.error) return { error: circRes.error?.message ?? hostRes.error?.message ?? 'read failed' }

  const circleChannel = new Map<string, string | null>()
  for (const c of (circRes.data ?? []) as { id: string; topical_channel_id: string | null }[]) {
    circleChannel.set(c.id, c.topical_channel_id)
  }
  const hostAreas = new Map<string, string | null>()
  for (const h of (hostRes.data ?? []) as { id: string; meta: unknown }[]) hostAreas.set(h.id, chosenAreaOf(h.meta))

  const metricEvents: MetricEvent[] = events.flatMap((e) => (e.starts_at ? [{
    startsAt: e.starts_at,
    hostId: e.host_id,
    city: e.city,
    channel: (e.scope_circle_id ? circleChannel.get(e.scope_circle_id) : null) ?? e.category ?? null,
  }] : []))
  const weeklyMembers = (memRes.data ?? []).map((m) => ({ city: m.city, chosenArea: chosenAreaOf(m.meta) }))
  return { rows: computeRegionMetrics({ now, events: metricEvents, hostAreas, weeklyMembers }) }
}
