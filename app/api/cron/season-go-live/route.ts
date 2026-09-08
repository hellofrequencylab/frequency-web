// LIVE-190 budget (ADR-1252): BOUNDED BY DESIGN. One promotion per invocation, by the seasons model
// (only one season is live at a time), so the stated 1 is the work itself and the due count it
// reports is the remainder. app/api/cron/budget.test.ts names this route in BOUNDED_BY_DESIGN.
// Auto-go-live for Scheduled seasons. When a season's go-live time arrives, flip
// it from Scheduled to Live (stored 'active') — the START side of the lifecycle.
// The rich season ROLLOVER (mint trophies, convert Zaps->Gems, reset counters,
// open the next season) is reset_season(), a manual janitor action; this cron does
// NOT touch that. It promotes at most one season per run and only when no season is
// currently Live (the schema enforces at most one 'active' season — the operator must
// end the prior season via the manual rollover first).
//
// Requires CRON_SECRET (matched against Vercel Cron's Authorization: Bearer header).
// The season write goes through the service-role admin client inside the helper.

import { NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { promoteDueScheduledSeasons } from '@/lib/seasons'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handler(request: Request) {
  const denied = rejectUnauthorizedCron(request)
  if (denied) return denied

  try {
    const budget = cronBudget(1)
    const result = await promoteDueScheduledSeasons()
    const summary = budget.summary(result.promoted, Math.max(0, result.scheduledDue - result.promoted))
    log.info('cron.season_go_live', {
      ...summary,
      scheduledDue: result.scheduledDue,
      promoted: result.promoted,
      promotedId: result.promotedId,
      skippedBecauseActive: result.skippedBecauseActive,
    })

    return NextResponse.json({
      ok: true,
      scheduledFound: result.scheduledDue,
      promoted: result.promoted,
      promotedId: result.promotedId,
      skippedBecauseActive: result.skippedBecauseActive,
      budget: summary,
    })
  } catch (e) {
    // Never throw out of the cron handler: log and return a summary so a transient
    // failure is visible in the run log without crashing the schedule.
    const message = e instanceof Error ? e.message : String(e)
    log.error('cron.season_go_live.failed', { error: message })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export const GET = withCronHeartbeat('season-go-live', handler)
