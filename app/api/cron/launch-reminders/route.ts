// LIVE-190 budget (ADR-1252): 200 launches per invocation; the launch_email_log row is the claim, so a mailed or skipped kind leaves the next run's decision; oldest quiet first, which is the most-due first.
// The clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts; app/api/cron/budget.test.ts checks the
// declaration is applied, not merely written down.
/**
 * Launch come-back cron (VLS-26, VLS-27). Runs every 15 minutes via Vercel Cron.
 *
 * Mails the come-back notes to a person who stopped partway through their launch: one hour, one day and three days after
 * they stop, at most three, only 8am to 8pm in their own time zone, ending when they resume, launch, cancel or opt out.
 * The rule is lib/launch/comeback.ts, the runner is lib/launch/comeback-io.ts, the words are lib/launch/comeback-email.ts;
 * this file is the auth, the switch, the budget and the heartbeat.
 *
 * Dark until LAUNCH_SYSTEM_ENABLED is set (docs/RUNBOOKS.md, "Vera guided launch"). A skipped run is logged, not silent.
 * Claim, then send (ADR-1212): a per-launch failure is counted and answered as a 500 so the heartbeat fail-pings.
 *
 * Requires CRON_SECRET env var for security.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { launchSystemEnabled } from '@/lib/launch/enabled'
import { runLaunchComebacks } from '@/lib/launch/comeback-io'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  if (!launchSystemEnabled()) {
    log.info('cron.launch_reminders.skipped', { reason: 'LAUNCH_SYSTEM_ENABLED is off' })
    return NextResponse.json({ skipped: true, reason: 'LAUNCH_SYSTEM_ENABLED is off' })
  }

  const budget = cronBudget(200)
  try {
    const result = await log.time('cron.launch_reminders', () =>
      runLaunchComebacks({ limit: budget.items, exhausted: budget.exhausted }),
    )
    const summary = budget.summary(result.scanned - result.remaining, result.remaining)
    log.info('[launch-reminders] run', { ...result, ...summary })
    return NextResponse.json({ ok: result.failed === 0, ...result, budget: summary }, { status: result.failed === 0 ? 200 : 500 })
  } catch (e) {
    log.error('cron.launch_reminders.read_failed', { error: e instanceof Error ? e.message : String(e) })
    return NextResponse.json({ error: 'launch reminders failed' }, { status: 500 })
  }
}

export const GET = withCronHeartbeat('launch-reminders', handler)
