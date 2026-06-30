// Read-only SLO discovery endpoint (H0-8 · docs/SLOs.md).
//
// Serves the service SLO contract from lib/observability/slos.ts as JSON, so a
// dashboard, an external uptime/CI check, or an on-call engineer can read the
// CURRENT targets straight from the running app instead of a doc that may lag the
// code. It publishes only the static contract (targets + cron freshness windows) —
// the same numbers already in docs/SLOs.md — and reports NO live measurement.
//
// SAFE BY CONSTRUCTION. No DB query, no env var, no secret, no auth-scoped data: it
// returns pure config that is already documented publicly. GET-only. Cached for an
// hour at the edge since the contract changes only on a deploy.

import { NextResponse } from 'next/server'
import { SLOS, CRON_FRESHNESS } from '@/lib/observability/slos'

export const dynamic = 'force-static'
export const revalidate = 3600

export function GET() {
  return NextResponse.json(
    {
      // A timestamp so a consumer can tell roughly when it read the contract; the
      // contract itself only changes on deploy (the response is statically cached).
      generatedAt: new Date().toISOString(),
      slos: SLOS,
      cronFreshness: CRON_FRESHNESS,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    },
  )
}
