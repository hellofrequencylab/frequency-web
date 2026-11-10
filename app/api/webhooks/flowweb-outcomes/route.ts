// FlowWeb outcomes pull (LIVE-2255). FlowWeb's daemon POSTs `{ "since": ISO date }` here once a day, signed
// with FLOWWEB_OUTCOMES_SECRET as hex HMAC-SHA256 of `${x-flowweb-timestamp}.${body}` in
// x-flowweb-signature (the same scheme as /api/webhooks/flowweb-claim). It answers what became of the
// people FlowWeb's links reached, counted per utm_campaign + utm_content, plus this week's region numbers.
// Read-only and counts only: no name, email or profile id leaves. Until the secret is set every request is
// refused (401). FAIL-LOUD: a failed read answers 500, never zeros, because FlowWeb would learn from zeros.
// Logic: lib/flowweb/outcomes.ts and lib/onboarding/region-metrics-load.ts.

import { NextResponse } from 'next/server'
import { envStringOrNull } from '@/lib/env/string'
import { verifySignature } from '@/lib/flowweb/claim'
import { computeOutcomes, parseOutcomesRequest } from '@/lib/flowweb/outcomes'
import { loadRegionMetrics } from '@/lib/onboarding/region-metrics-load'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ROW_CAP = 20_000

export async function POST(req: Request) {
  const secret = envStringOrNull('FLOWWEB_OUTCOMES_SECRET') ?? ''
  const body = await req.text()
  const ts = req.headers.get('x-flowweb-timestamp') ?? ''
  const sig = req.headers.get('x-flowweb-signature') ?? ''
  if (!verifySignature(secret, ts, body, sig)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let raw: unknown
  try {
    raw = body.trim() ? JSON.parse(body) : {}
  } catch {
    return NextResponse.json({ error: 'the body is not JSON' }, { status: 400 })
  }
  const now = new Date()
  const parsed = parseOutcomesRequest(raw, now)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const since = parsed.since.toISOString()

  const admin = createAdminClient()
  const rootId = await loadRootSpaceId()
  if (!rootId) return fail('the root Space is not set')
  const [leadRes, memRes] = await Promise.all([
    admin
      .from('contacts')
      .select('meta')
      .eq('space_id', rootId)
      .eq('meta->funnel->>utm_source', 'flowweb')
      .gte('created_at', since)
      .limit(ROW_CAP),
    admin
      .from('profiles')
      .select('id, meta, membership_tier')
      .eq('is_demo', false)
      .eq('meta->funnel->>utm_source', 'flowweb')
      .gte('created_at', since)
      .limit(ROW_CAP),
  ])
  if (leadRes.error || memRes.error) return fail(leadRes.error?.message ?? memRes.error?.message ?? 'read failed')
  const members = memRes.data ?? []
  const memberIds = members.map((m) => m.id)
  const hostRes = memberIds.length
    ? await admin
        .from('events')
        .select('host_id')
        .in('host_id', memberIds)
        .eq('status', 'published')
        .eq('is_demo', false)
        .limit(ROW_CAP)
    : { data: [], error: null }
  if (hostRes.error) return fail(hostRes.error.message)
  const hostIds = new Set((hostRes.data ?? []).map((e) => e.host_id).filter((x): x is string => !!x))

  const regions = await loadRegionMetrics(admin, now)
  if ('error' in regions) return fail(regions.error)

  const outcomes = computeOutcomes({ leads: leadRes.data ?? [], members, hostIds })
  log.info('flowweb.outcomes', { since, rows: outcomes.length })
  return NextResponse.json({ as_of: now.toISOString(), since, outcomes, regions: regions.rows })
}

function fail(reason: string) {
  log.error('flowweb.outcomes_failed', { error: reason })
  return NextResponse.json({ error: 'read failed', reason }, { status: 500 })
}
