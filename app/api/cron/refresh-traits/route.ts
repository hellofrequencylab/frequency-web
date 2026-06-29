// Nightly cron — recomputes member_traits from the engagement ledger (ADR-069
// Phase 2). Called by Vercel Cron (see vercel.json). Requires CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { refreshMemberTraits } from '@/lib/traits/refresh'
import { refreshResonanceEdges } from '@/lib/resonance/edges'
import { refreshResonanceEmbeddings } from '@/lib/resonance/embeddings'
import { refreshResonanceDensityCells } from '@/lib/resonance/density'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
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

  // Embedding-retrieval step (ADR-385 Phase 4): refresh one 384-d resonance embedding per opted-in
  // member from their content signal (Pillars / Journeys / practices). BEST-EFFORT + FAIL-SAFE: a
  // no-op when AI is off (no spend) or pgvector / the table is absent, and any error is swallowed
  // inside refreshResonanceEmbeddings, so this NEVER breaks the trait or edge refresh. Runs last so
  // the engine has fresh embeddings for tomorrow night's edge generation.
  const resonanceEmbeddings = await refreshResonanceEmbeddings()
  log.info('cron.refresh_resonance_embeddings', resonanceEmbeddings)

  // Density-rollup step (Resonance Feed Phase 2, ADR-416): rebuild resonance_density_cells so the
  // adaptive-radius feed + the founder-vs-activity branch read fresh per-geocell activity. BEST-EFFORT
  // + FAIL-SAFE: a missing function (pre-migration) or any error is swallowed inside the helper, so it
  // never breaks the steps above. Counts only, fuzzed cells only (no identities, no raw coordinates).
  const resonanceDensity = await refreshResonanceDensityCells()
  log.info('cron.refresh_resonance_density', resonanceDensity)

  return NextResponse.json({ ok: true, ...result, resonance, resonanceEmbeddings, resonanceDensity })
}

export const GET = withCronHeartbeat('refresh-traits', handler)
