// LIVE-622 budget (ADR-1252): 100 orders or rows per pass per invocation; a row that lands flips out of the queue and one that fails is re-stamped, so the tail resumes by itself.
// The clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts; app/api/cron/budget.test.ts checks the
// declaration is applied, not merely written down.
/**
 * Transfer reconciler (LIVE-622, ADR-1614). A split order pays each seller by a Stripe transfer
 * created at settle, and any one of them can fail on its own. Every half hour this goes back for
 * them: a paid split order the settle never planned is planned, every planned or failed transfer
 * under the attempt ceiling is retried under its original idempotency key, and every transfer over
 * the ceiling is logged as stuck, one line each (lib/commerce/transfers.ts reconcileTransfers).
 * Idempotent and bounded; safe to run at any time. Requires CRON_SECRET.
 */

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
    const budget = cronBudget(100)
    const result = await reconcileTransfers({ limit: budget.items, exhausted: budget.exhausted })
    const summary = budget.summary(result.orders, result.remainingOrders)
    log.info('cron.reconcile_transfers', { ...result, ...summary })
    return NextResponse.json({ ok: true, ...result, budget: summary })
  } catch (err) {
    log.error('cron.reconcile_transfers.failed', { error: briefError(err) })
    return NextResponse.json({ error: 'transfer reconcile failed' }, { status: 500 })
  }
}

export const GET = withCronHeartbeat('reconcile-transfers', handler)
