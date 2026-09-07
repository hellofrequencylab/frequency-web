// LIVE-190 budget (ADR-1252): 200 due enrollments per invocation; the enrollment status flip is the claim; the tail is the next run's head.
// The clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts; app/api/cron/budget.test.ts checks the
// declaration is applied, not merely written down.
/**
 * Nurture cron (ADR-131). Advances due per-persona nurture enrollments — sends the
 * next step (consent-gated, queued) and reschedules or completes. Runs every 15 min
 * via Vercel Cron. Requires CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { runDueNurture } from '@/lib/nurture/runner'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  try {
    // Timed: log.time wraps the due-enrollment advance and emits one structured
    // line carrying duration_ms + ok, queryable by `cron.nurture`. On failure it
    // emits the error line (ok:false) and re-throws, so the catch still returns 500.
    const budget = cronBudget(200)
    const result = await log.time('cron.nurture', () => runDueNurture(budget.items))
    const summary = budget.summary(result.processed)
    log.info('cron.nurture.counts', { ...result, ...summary })
    return NextResponse.json({ ok: true, ...result, budget: summary })
  } catch {
    return NextResponse.json({ error: 'nurture run failed' }, { status: 500 })
  }
}

export const GET = withCronHeartbeat('nurture', handler)
