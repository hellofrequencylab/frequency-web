// LIVE-190 budget (ADR-1252): 200 due drip enrollments per invocation; the enrollment lease is the claim (ADR-1212); the tail is the next run's head.
// The clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts; app/api/cron/budget.test.ts checks the
// declaration is applied, not merely written down.
/**
 * Per-Space drip RUNNER cron (the FIRE job, ADR-561). Drains DUE drip enrollments (status 'enrolled'
 * AND next_run_at <= now()), sending each contact's CURRENT step exactly once (idempotent claim in
 * lib/spaces/drip-runner.ts) through the Space system send seam, then advancing to the next step or
 * marking 'done'. Runs every 5 min via Vercel Cron (vercel.json). Requires CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { runDueSpaceDrips } from '@/lib/spaces/drip-runner'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  try {
    // log.time wraps the fire pass and emits one structured line (duration_ms + ok), queryable by
    // `cron.space_drips`. On failure it emits the error line and re-throws (the catch returns 500).
    const budget = cronBudget(200)
    const result = await log.time('cron.space_drips', () => runDueSpaceDrips(budget.items))
    const summary = budget.summary(result.due)
    log.info('cron.space_drips.counts', { ...result, ...summary })
    return NextResponse.json({ ok: true, ...result, budget: summary })
  } catch {
    return NextResponse.json({ error: 'space drip run failed' }, { status: 500 })
  }
}

export const GET = withCronHeartbeat('space-drips', handler)
