// Nightly cron — recomputes member_traits from the engagement ledger (ADR-069
// Phase 2). Called by Vercel Cron (see vercel.json). Requires CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { refreshMemberTraits } from '@/lib/traits/refresh'
import { refreshResonanceEdges } from '@/lib/resonance/edges'
import { refreshResonanceEmbeddings } from '@/lib/resonance/embeddings'
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

  // Embedding-retrieval step (ADR-385 Phase 4): refresh one 384-d resonance embedding per opted-in
  // member from their content signal (Pillars / Journeys / practices). BEST-EFFORT + FAIL-SAFE: a
  // no-op when AI is off (no spend) or pgvector / the table is absent, and any error is swallowed
  // inside refreshResonanceEmbeddings, so this NEVER breaks the trait or edge refresh. Runs last so
  // the engine has fresh embeddings for tomorrow night's edge generation.
  const resonanceEmbeddings = await refreshResonanceEmbeddings()
  log.info('cron.refresh_resonance_embeddings', resonanceEmbeddings)

  return NextResponse.json({ ok: true, ...result, resonance, resonanceEmbeddings })
}
