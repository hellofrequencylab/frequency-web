// Nightly cron — recomputes member_traits from the engagement ledger (ADR-069
// Phase 2). Called by Vercel Cron (see vercel.json). Requires CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { refreshMemberTraits } from '@/lib/traits/refresh'
import { refreshResonanceEdges } from '@/lib/resonance/edges'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const result = await refreshMemberTraits()
  log.info('cron.refresh_traits', result)

  // Resonance Graph step (ADR-385): recompute + persist the consenting graph's edges AFTER the trait
  // refresh, so the reciprocal re-ranker reads tonight's activation_propensity + churn_risk. It also
  // writes the resonance_match_count trait from each anchor's edge count. BEST-EFFORT + FAIL-SAFE: a
  // missing table / extension (pre-migration) or any error is swallowed inside refreshResonanceEdges,
  // so the cron always completes the trait refresh even when the graph is absent.
  const resonance = await refreshResonanceEdges()
  log.info('cron.refresh_resonance_edges', resonance)

  return NextResponse.json({ ok: true, ...result, resonance })
}
