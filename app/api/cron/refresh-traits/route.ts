// LIVE-190 budget (ADR-1252): 2000 resonance anchors per invocation; the traits half is whole-population by design (two RPCs, batched upserts, no per-member round trip); the embeddings half keeps its own 500 cap; NO cursor on the opted-in read, so a tail past 2000 waits on one. Recorded in the row.
// The clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts; app/api/cron/budget.test.ts checks the
// declaration is applied, not merely written down.
// Nightly cron — recomputes member_traits from the engagement ledger (ADR-069
// Phase 2). Called by Vercel Cron (see vercel.json). Requires CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { refreshMemberTraits } from '@/lib/traits/refresh'
import { refreshResonanceEdges } from '@/lib/resonance/edges'
import { refreshResonanceEmbeddings } from '@/lib/resonance/embeddings'
import { refreshResonanceDensityCells } from '@/lib/resonance/density'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  // Timed: the primary nightly recompute is the cron's heaviest step, so wrap it
  // in log.time to emit duration_ms + ok queryable by `cron.refresh_traits`. The
  // existing counts line is kept under a `.counts` event for back-compat.
  const budget = cronBudget(2000)
  const result = await log.time('cron.refresh_traits', () => refreshMemberTraits())
  log.info('cron.refresh_traits.counts', result)

  // Resonance Graph step (ADR-385): recompute + persist the consenting graph's edges AFTER the trait
  // refresh, so the reciprocal re-ranker reads tonight's activation_propensity + churn_risk. It also
  // writes the resonance_match_count trait from each anchor's edge count. BEST-EFFORT + FAIL-SAFE: a
  // missing table / extension (pre-migration) or any error is swallowed inside refreshResonanceEdges,
  // so the cron always completes the trait refresh even when the graph is absent.
  const resonance = await refreshResonanceEdges({ limitAnchors: budget.items })
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
  // + FAIL-SAFE: a missing function (pre-migration) or any error is caught inside the helper, so it
  // never breaks the steps above. Counts only, fuzzed cells only (no identities, no raw coordinates).
  //
  // Caught is not swallowed (finding R2, 2026-09-04): the helper returns the error message, this
  // step logs it at ERROR level under its own `.failed` event, and the JSON carries `ok: false` for
  // the step. The response stays 200 with `ok: true` at the top because the trait / edge / embedding
  // steps above did complete; a 5xx here would fail-ping the heartbeat for work that succeeded. The
  // rollup had been failing with sqlstate 21000 on every run since 2026-08-22 and this line was the
  // one place it could have been seen; it read as info with cells: 0 (migration 20270345000000).
  const resonanceDensity = await refreshResonanceDensityCells()
  const resonanceDensityStep = { ok: !resonanceDensity.error, ...resonanceDensity }
  if (resonanceDensity.error) {
    log.error('cron.refresh_resonance_density.failed', resonanceDensityStep)
  } else {
    log.info('cron.refresh_resonance_density', resonanceDensityStep)
  }

  const summary = budget.summary(resonance.anchors)
  log.info('cron.refresh_traits.budget', { ...summary })
  return NextResponse.json({
    ok: true,
    ...result,
    resonance,
    resonanceEmbeddings,
    resonanceDensity: resonanceDensityStep,
    budget: summary,
  })
}

export const GET = withCronHeartbeat('refresh-traits', handler)
