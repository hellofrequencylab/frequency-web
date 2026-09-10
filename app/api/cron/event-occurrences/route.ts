// LIVE-190 budget (ADR-1252): 2000 recurring anchors per invocation; NO cursor yet (generation writes nothing on the anchor), so the clock is the real bound and the row records the missing generated-at column.
// The clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts; app/api/cron/budget.test.ts checks the
// declaration is applied, not merely written down.
// Daily cron — rolls the recurring-event materialisation window forward.
// Called by Vercel Cron (see vercel.json). Requires CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { generateAllOccurrences } from '@/lib/event-recurrence'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  // Timed: log.time wraps the materialisation roll and emits one structured line
  // carrying duration_ms + ok, so a slow run is queryable by `cron.event_occurrences`.
  const budget = cronBudget(2000)
  const result = await log.time('cron.event_occurrences', () =>
    generateAllOccurrences({ limit: budget.items, exhausted: budget.exhausted }),
  )
  const summary = budget.summary(result.anchorsVisited, result.remaining)
  // The retire/keep pair is logged beside the create count on purpose (ADR-1304). Retirement is the
  // only DELETE in this cron, and it is the half that heals a series whose rule changed before the
  // reconciliation existed — a run that reports zero retired forever on a repo that has just gained
  // the feature is the fail-safe firing silently, which is the thing the module's own header says
  // never to ship. `occurrencesKept` counts dates the new rule does not produce that were left live
  // because somebody is attached to them; a number that stays high is a host who should be
  // CANCELLING those dates, not a bug.
  log.info('cron.event_occurrences.counts', {
    anchors:            result.anchorCount,
    occurrencesCreated: result.occurrencesCreated,
    occurrencesRetired: result.occurrencesRetired,
    occurrencesKept:    result.occurrencesKept,
    ...summary,
  })
  return NextResponse.json({ ok: true, ...result, budget: summary })
}

export const GET = withCronHeartbeat('event-occurrences', handler)
