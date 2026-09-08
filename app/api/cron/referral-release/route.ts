// LIVE-190 budget (ADR-1252): 200 unsettled referral pairs per invocation; a released pair is settled and skipped next run, so the tail resumes by itself.
// The clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts; app/api/cron/budget.test.ts checks the
// declaration is applied, not merely written down.
/**
 * Referral-release cron. Pays the referrer (invite_accepted Zaps) once a referred
 * member ACTIVATES — joins a circle, adopts or logs a practice (lib/qr/referral.ts
 * runReferralRelease). Gating the payout on activation is the top anti-fraud move
 * (self/fake signups never activate) and rewards the high-LTV cohort. Idempotent +
 * bounded; safe to run frequently. Requires CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { runReferralRelease } from '@/lib/qr/referral'
import { log, briefError } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  try {
    const budget = cronBudget(200)
    const result = await runReferralRelease({ limit: budget.items, exhausted: budget.exhausted })
    const summary = budget.summary(result.checked)
    log.info('cron.referral_release', { ...result, ...summary })
    return NextResponse.json({ ok: true, ...result, budget: summary })
  } catch (err) {
    log.error('cron.referral_release.failed', { error: briefError(err) })
    return NextResponse.json({ error: 'referral release failed' }, { status: 500 })
  }
}

export const GET = withCronHeartbeat('referral-release', handler)
