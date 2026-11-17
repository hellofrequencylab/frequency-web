// LIVE-2328 budget (ADR-1252): 200 connected accounts per run, one Stripe read each, sequential.
// Past 200 the window rotates by day, so every account is re-read within ceil(total / 200) days.
/**
 * Connected account resync (LIVE-2328). Once a day this re-reads every Stripe connected account
 * and mirrors its charges, payouts and details flags onto the owning profile through
 * `persistAccount` (lib/billing/connect.ts resyncConnectedAccounts). It keeps the flags checkout
 * reads at most a day old even when the Connect-scoped `account.updated` webhook is not delivering.
 * A failed account is logged and the run carries on. With no Stripe key the run returns 200 with a
 * skipped reason and logs `cron.connect_resync.skipped` at warn, so the skip is never silent.
 * Idempotent and bounded; safe to run at any time. Requires CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { persistAccount, resyncConnectedAccounts } from '@/lib/billing/connect'
import { log, briefError } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  try {
    const budget = cronBudget(200)
    const result = await resyncConnectedAccounts({
      persist: persistAccount,
      limit: budget.items,
      exhausted: budget.exhausted,
    })
    const summary = budget.summary(result.checked + result.failed, result.remaining)
    if (result.skipped) {
      log.warn('cron.connect_resync.skipped', { reason: result.skipped })
    } else {
      log.info('cron.connect_resync', { ...result, ...summary })
    }
    return NextResponse.json({ ok: true, ...result, budget: summary })
  } catch (err) {
    log.error('cron.connect_resync.failed', { error: briefError(err) })
    return NextResponse.json({ error: 'connected account resync failed' }, { status: 500 })
  }
}

export const GET = withCronHeartbeat('connect-resync', handler)
