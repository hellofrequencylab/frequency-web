// Read-only status index / discovery endpoint (H0-8 · docs/SLOs.md).
//
// The single entry point for the /api/status/* family. Where the sibling routes each
// serve one slice (GET /api/status/slos = raw targets, GET /api/status/error-budget =
// the budget each ratio target implies), this route is the INDEX: it lists every
// status endpoint with a one-line description, and carries a small at-a-glance summary
// (how many SLOs, how many page-vs-track, how many cron jobs are under a freshness
// window) so a dashboard, an uptime check, or an on-call engineer can hit one URL,
// learn what's available, and follow the links — instead of having to already know the
// sub-paths exist.
//
// SAFE BY CONSTRUCTION. No DB query, no env var, no secret, no auth-scoped data: it
// returns pure config + counts already published by the sibling routes. It reports NO
// live measurement — only the static contract and where to read it. GET-only, cached
// for an hour at the edge since the contract changes only on a deploy.

import { NextResponse } from 'next/server'
import { SLOS, CRON_FRESHNESS } from '@/lib/observability/slos'

export const dynamic = 'force-static'
export const revalidate = 3600

/** The status endpoints this index links to. Keep in step with the routes that exist
 *  under app/api/status/ — adding a sibling route means adding a line here. */
const ENDPOINTS = [
  {
    path: '/api/status',
    method: 'GET',
    description:
      'This index. Lists the status endpoints and a summary of the SLO contract.',
  },
  {
    path: '/api/status/slos',
    method: 'GET',
    description:
      'The raw service SLO targets (availability, latency, error-rate, freshness) and per-cron freshness windows.',
  },
  {
    path: '/api/status/error-budget',
    method: 'GET',
    description:
      'The allowed-failure fraction each ratio SLO target implies, for computing burn against a live measurement.',
  },
] as const

export function GET() {
  // Cheap, derived-from-config counts — no measurement, just shape of the contract.
  const pageCount = SLOS.filter((s) => s.onBreach === 'page').length
  const cronJobCount = CRON_FRESHNESS.reduce((n, w) => n + w.jobs.length, 0)

  return NextResponse.json(
    {
      // A timestamp so a consumer can tell roughly when it read the index; the
      // contract itself only changes on deploy (the response is statically cached).
      generatedAt: new Date().toISOString(),
      service: 'frequency',
      // Pure discovery: what's here and what each link gives you.
      endpoints: ENDPOINTS,
      // At-a-glance shape of the contract so the index is useful on its own; the
      // numbers behind these counts live in /api/status/slos.
      summary: {
        sloCount: SLOS.length,
        pageOnBreachCount: pageCount,
        trackOnBreachCount: SLOS.length - pageCount,
        cronFreshnessGroups: CRON_FRESHNESS.length,
        cronJobsUnderFreshnessWindow: cronJobCount,
      },
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    },
  )
}
