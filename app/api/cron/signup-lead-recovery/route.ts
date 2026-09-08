// LIVE-190 budget (ADR-1252): 200 cold leads per invocation; the recovery_sent_at stamp is the claim, so a mailed row leaves the query; oldest updated_at first, which is the coldest first.
// The clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts; app/api/cron/budget.test.ts checks the
// declaration is applied, not merely written down.
/**
 * Signup lead recovery cron (LIVE-170, ADR-1274). Runs daily via Vercel Cron.
 *
 * Mails ONE transactional "finish setting up your account" note to each signup_leads row that
 * never converted, reached at least step 2 (gave an email and went on), went cold at least 24
 * hours ago, and has never been mailed. The rule and the runner live in
 * lib/crm/signup-lead-recovery.ts; this file is the auth, the budget and the heartbeat.
 *
 * Claim, then send (ADR-1212): recovery_sent_at is stamped by a conditional update before the
 * note is enqueued, so overlapping or retried runs cannot mail a lead twice. A per-lead failure
 * is counted and answered as a 500 so the heartbeat fail-pings; every lead that did claim is out
 * of the next run's selection, so the retry is safe.
 *
 * Requires CRON_SECRET env var for security.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { runSignupLeadRecovery } from '@/lib/crm/signup-lead-recovery'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const budget = cronBudget(200)
  try {
    const result = await log.time('cron.signup_lead_recovery', () =>
      runSignupLeadRecovery({ limit: budget.items, exhausted: budget.exhausted }),
    )
    const summary = budget.summary(result.scanned - result.remaining, result.remaining)
    log.info('cron.signup_lead_recovery.counts', { ...result, ...summary })
    return NextResponse.json(
      { ok: result.failed === 0, ...result, budget: summary },
      { status: result.failed === 0 ? 200 : 500 },
    )
  } catch (e) {
    log.error('cron.signup_lead_recovery.read_failed', { error: e instanceof Error ? e.message : String(e) })
    return NextResponse.json({ error: 'signup lead recovery failed' }, { status: 500 })
  }
}

export const GET = withCronHeartbeat('signup-lead-recovery', handler)
