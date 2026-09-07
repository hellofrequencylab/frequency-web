// LIVE-190 budget (ADR-1252): 2000 rows per phase (the long-standing SWEEP_CAP, now passed in) per invocation; each phase re-reads its own query next hour and every send is idempotent per member-day, so a cut-off run costs an hour, not a send.
// The clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts; app/api/cron/budget.test.ts checks the
// declaration is applied, not merely written down.
/**
 * Practice lifecycle cron (ADR-920 Phase 3). Hourly. Two jobs in one pass, both idempotent:
 *
 *   1. TERM COMPLETIONS — retire active self-adopted commitments whose ends_on has passed in
 *      the member's OWN calendar (reason 'completed') and send the completion notice with the
 *      re-adopt door. Hourly so the celebration lands within an hour of local midnight, in
 *      every timezone, instead of at one fixed UTC moment.
 *
 *   2. DAILY REMINDERS — at most one nudge a day per member, in the hour they usually
 *      practice (derived from their own log history, tz-correct via profiles.home_timezone),
 *      only while something is still unlogged today. Gated by the `practice` notification
 *      category (in-app default-on; push opt-in).
 *
 * Requires CRON_SECRET. Engine: lib/practices/lifecycle.ts (pure core + IO sweep).
 */

import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { runPracticeLifecycleSweep } from '@/lib/practices/lifecycle'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'
// The reminder pass is a bounded per-member loop; give it the full cron window so a slow
// hour degrades to "finished late," never "died mid-loop with errors swallowed."
export const maxDuration = 300

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const budget = cronBudget(2000)
  const result = await runPracticeLifecycleSweep(new Date(), { limit: budget.items, exhausted: budget.exhausted })
  const summary = budget.summary(
    result.completionsRetired + result.remindersSent + result.stalePrompts,
    result.remaining,
  )
  log.info('cron.practice_lifecycle', { ...result, ...summary })
  return NextResponse.json({ ok: true, ...result, budget: summary })
}

export const GET = withCronHeartbeat('practice-lifecycle', handler)
