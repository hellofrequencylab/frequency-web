// Core Web Vitals field sink. ANONYMOUS BY DESIGN — unlike /api/track (drops anon)
// and /api/observe (member-tied + consent-gated), this accepts unauthenticated posts,
// because vitals describe the PAGE and device, not a member. It never resolves or
// stores a profile_id, which is what keeps it outside the `analytics` consent scope
// (account-tied data, lib/consent/scopes.ts). Rows land in interaction_events with
// profile_id NULL and surface NULL so both member rollups ignore them by their
// existing filters; the 90-day retention purge bounds the table. No rate limiter on
// purpose: lib/rate-limit fails CLOSED in prod when KV is unconfigured (which would
// silently drop 100% of vitals) — the batch cap + normalizer bound each request
// instead, and the payload is 204'd telemetry either way.
//
// 2026-09-05 (scan2 L2-08): the insert result is read. `.then(undefined, () => {})` handled a
// rejection, but supabase-js resolves `{ error }` and never rejects, so a failing insert was
// dropped with nothing in the logs: a silent, total loss of web-vitals. The error is now logged at
// error level with the table name; the beacon still gets its 204, because a beacon must never retry.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeVitalBatch, vitalProps } from '@/lib/analytics/vitals'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: { sessionId?: unknown; events?: unknown }
  try {
    body = await req.json()
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  const clean = normalizeVitalBatch(body?.events)
  if (clean.length === 0) return new NextResponse(null, { status: 204 })
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.slice(0, 64) : null

  const rows = clean.map((v) => ({
    profile_id: null, // never member-tied (see header)
    session_id: sessionId,
    kind: 'web_vital',
    surface: null, // NULL keeps these rows out of interaction_surface_stats
    path: v.path,
    // `vitalProps`, NOT a second copy of the same object literal. The inline version this
    // replaces omitted `vp` (the viewport bucket, ADR-922), so the client computed it, posted
    // it, and the write silently dropped it — every viewport-segmented Core Web Vitals query
    // returned nothing, and nothing failed. One builder means the wire shape and the written
    // shape cannot drift again (LIVE-036).
    props: vitalProps(v),
    occurred_at: new Date(Math.min(Date.now(), v.t)).toISOString(),
  }))

  // telemetry never surfaces an error
  // 2026-09-05 (scan2 L2-08): to the BEACON. It surfaces every error to the logs. supabase-js
  // resolves `{ error }`; the catch arm stays only for a transport that rejects outright.
  let insertError: { message: string } | null = null
  try {
    ;({ error: insertError } = await createAdminClient().from('interaction_events').insert(rows))
  } catch (err) {
    insertError = { message: err instanceof Error ? err.message : String(err) }
  }
  if (insertError) {
    log.error('vitals.insert_failed', { table: 'interaction_events', rows: rows.length, error: insertError.message })
  }

  return new NextResponse(null, { status: 204 })
}
