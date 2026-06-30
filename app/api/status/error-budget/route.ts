// Read-only error-budget discovery endpoint (H0-8 · docs/SLOs.md).
//
// Companion to GET /api/status/slos. Where that route serves the raw SLO targets,
// this one serves the ERROR BUDGET each ratio target implies — the allowed-failure
// fraction (e.g. 99.9% uptime → 0.001) computed from lib/observability/slos.ts. A
// dashboard or CI check can read the budget straight from the running app, then divide
// its own live failure measurement by `budget` to get a burn ratio, instead of
// re-deriving "what 99.9% allows" by hand somewhere the number can rot.
//
// SAFE BY CONSTRUCTION. No DB query, no env var, no secret, no auth-scoped data: it
// returns pure arithmetic over config already published by /api/status/slos. It
// reports NO live measurement — only the static budget the contract defines. GET-only,
// cached for an hour at the edge since the contract changes only on a deploy.

import { NextResponse } from 'next/server'
import { SLOS, sloBudgetFraction } from '@/lib/observability/slos'

export const dynamic = 'force-static'
export const revalidate = 3600

export function GET() {
  // Only ratio (`unit: '%'`) SLOs have a budget; sloBudgetFraction returns null for
  // latency/lag thresholds, which we omit rather than emit a meaningless number.
  const budgets = SLOS.map((slo) => ({
    sloId: slo.id,
    label: slo.label,
    target: slo.target,
    unit: slo.unit,
    direction: slo.direction,
    window: slo.window,
    onBreach: slo.onBreach,
    // Allowed-failure fraction in [0, 1], or null for a non-ratio SLO.
    budget: sloBudgetFraction(slo),
  })).filter((b) => b.budget !== null)

  return NextResponse.json(
    {
      // A timestamp so a consumer can tell roughly when it read the contract; the
      // contract itself only changes on deploy (the response is statically cached).
      generatedAt: new Date().toISOString(),
      budgets,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    },
  )
}
