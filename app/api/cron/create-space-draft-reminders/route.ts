// LIVE-1968 budget (ADR-1252): 200 drafts per invocation; the create_space_draft_email_log row is the claim, so a mailed or skipped kind leaves the next run's decision; oldest quiet first, which is the most-due first.
// The clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts; app/api/cron/budget.test.ts checks the
// declaration is applied, not merely written down.
/**
 * Create a Space draft reminders (LIVE-1968, ADR-1933). Runs every 15 minutes via Vercel Cron.
 *
 * Mails the three notes to a person who saved a draft to their email on /create-a-space and stopped: one hour, one day
 * and three days after the last save, at most three, only 8am to 8pm in the zone their browser reported, ending when they
 * save again, launch or unsubscribe. The rule is lib/create-space/draft-recovery.ts, the runner is draft-recovery-io.ts,
 * the words are draft-recovery-email.ts; this file is the auth, the switch, the budget and the heartbeat. The same run
 * purges drafts past their 90 days.
 *
 * Dark until CREATE_SPACE_DRAFT_REMINDERS_ENABLED is set (docs/RUNBOOKS.md, "Create a Space draft reminders"). A skipped
 * run is logged, not silent. Claim, then send (ADR-1212): a per-draft failure is counted and answered as a 500 so the
 * heartbeat fail-pings.
 *
 * Requires CRON_SECRET env var for security.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { draftRemindersEnabled } from '@/lib/create-space/enabled'
import { runDraftReminders } from '@/lib/create-space/draft-recovery-io'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  if (!draftRemindersEnabled()) {
    log.info('cron.create_space_draft_reminders.skipped', { reason: 'CREATE_SPACE_DRAFT_REMINDERS_ENABLED is off' })
    return NextResponse.json({ skipped: true, reason: 'CREATE_SPACE_DRAFT_REMINDERS_ENABLED is off' })
  }

  const budget = cronBudget(200)
  try {
    const result = await log.time('cron.create_space_draft_reminders', () =>
      runDraftReminders({ limit: budget.items, exhausted: budget.exhausted }),
    )
    const summary = budget.summary(result.scanned - result.remaining, result.remaining)
    log.info('[create-space-draft-reminders] run', { ...result, ...summary })
    return NextResponse.json({ ok: result.failed === 0, ...result, budget: summary }, { status: result.failed === 0 ? 200 : 500 })
  } catch (e) {
    log.error('cron.create_space_draft_reminders.read_failed', { error: e instanceof Error ? e.message : String(e) })
    return NextResponse.json({ error: 'create space draft reminders failed' }, { status: 500 })
  }
}

export const GET = withCronHeartbeat('create-space-draft-reminders', handler)
