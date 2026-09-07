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
  log.info('cron.event_occurrences.counts', {
    anchors:            result.anchorCount,
    occurrencesCreated: result.occurrencesCreated,
    ...summary,
  })
  return NextResponse.json({ ok: true, ...result, budget: summary })
}

export const GET = withCronHeartbeat('event-occurrences', handler)
