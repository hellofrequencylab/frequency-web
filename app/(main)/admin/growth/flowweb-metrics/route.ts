import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { regionMetricsCsv } from '@/lib/onboarding/region-metrics'
import { loadRegionMetrics } from '@/lib/onboarding/region-metrics-load'

// GET /admin/growth/flowweb-metrics (LIVE-2235): downloads this week's region numbers as the CSV that
// FlowWeb's metrics upload takes (territory_id,hosts_active_28d,events_next_14d,sub_areas_covered_14d,wam).
// Definitions live in lib/onboarding/region-metrics.ts; the read is lib/onboarding/region-metrics-load.ts.
//
// STAFF-GATED like /admin/growth: requireAdmin('admin', { staff: 'marketing', staffLevel: 'read' }).
// FAIL-LOUD: a read that fails answers 500 with the reason, never a CSV of zeros, because FlowWeb would
// read zeros as a region going cold.

export const dynamic = 'force-dynamic'

export async function GET() {
  await requireAdmin('admin', { staff: 'marketing', staffLevel: 'read' })
  const now = new Date()
  const res = await loadRegionMetrics(createAdminClient(), now)
  if ('error' in res) {
    console.error('[flowweb-metrics] read failed; no CSV served:', res.error)
    return new Response(`Could not read the region numbers: ${res.error}\n`, { status: 500 })
  }
  const day = now.toISOString().slice(0, 10)
  return new Response(regionMetricsCsv(res.rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="flowweb-region-metrics-${day}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
