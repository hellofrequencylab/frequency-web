import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  chosenAreaOf,
  computeRegionMetrics,
  regionMetricsCsv,
  type MetricEvent,
} from '@/lib/onboarding/region-metrics'

// GET /admin/growth/flowweb-metrics (LIVE-2235): downloads this week's region numbers as the CSV that
// FlowWeb's metrics upload takes (territory_id,hosts_active_28d,events_next_14d,sub_areas_covered_14d,wam).
// Definitions live in lib/onboarding/region-metrics.ts.
//
// STAFF-GATED like /admin/growth: requireAdmin('admin', { staff: 'marketing', staffLevel: 'read' }).
// Service role because the counts span every member's events and last-seen time, which RLS scopes to the
// viewer's own region. It reads only counts' inputs and returns only the four totals per region.
// FAIL-LOUD: a read that fails answers 500 with the reason, never a CSV of zeros, because FlowWeb would
// read zeros as a region going cold.

export const dynamic = 'force-dynamic'

const DAY = 86_400_000
const ROW_CAP = 20_000

export async function GET() {
  await requireAdmin('admin', { staff: 'marketing', staffLevel: 'read' })
  const admin = createAdminClient()
  const now = new Date()
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
  if (evRes.error || memRes.error) {
    const reason = evRes.error?.message ?? memRes.error?.message
    console.error('[flowweb-metrics] read failed; no CSV served:', reason)
    return new Response(`Could not read the region numbers: ${reason}\n`, { status: 500 })
  }

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
  if (circRes.error || hostRes.error) {
    const reason = circRes.error?.message ?? hostRes.error?.message
    console.error('[flowweb-metrics] read failed; no CSV served:', reason)
    return new Response(`Could not read the region numbers: ${reason}\n`, { status: 500 })
  }

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

  const csv = regionMetricsCsv(computeRegionMetrics({ now, events: metricEvents, hostAreas, weeklyMembers }))
  const day = now.toISOString().slice(0, 10)
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="flowweb-region-metrics-${day}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
