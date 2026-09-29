// LIVE-190 budget (ADR-1252): 40 transfer rows / unpaid split orders per invocation; a created
// or reversed row is skipped next run, a failed row under the attempts ceiling is retried, and
// a row over the ceiling is a log line, never silent. The clock is CRON_TIME_BUDGET_MS from
// lib/cron/budget.ts; app/api/cron/budget.test.ts checks the declaration is applied, not merely
// written down.
//
// Cron: pay the sellers of a separate-charges commerce order (LIVE-622, ADR-1636). A destination
// charge is atomic; a split order is N Stripe transfers that each fail on their own, so the
// settle writes a planned row per seller and this job goes back for the ones that did not land.
// Every 30 minutes (vercel.json). Requires CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { reconcileTransfers } from '@/lib/commerce/transfers'
import { log, briefError } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  try {
    const budget = cronBudget(40)
    const result = await reconcileTransfers({ limit: budget.items, exhausted: budget.exhausted })
    const summary = budget.summary(result.processed, result.stuck)
    log.info('cron.reconcile_transfers', { ...result, ...summary })
    return NextResponse.json({ ok: true, ...result, budget: summary })
  } catch (err) {
    log.error('cron.reconcile_transfers.failed', { error: briefError(err) })
    return NextResponse.json({ error: 'transfer reconcile failed' }, { status: 500 })
  }
}

export const GET = withCronHeartbeat('reconcile-transfers', handler)
