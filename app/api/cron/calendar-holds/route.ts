// LIVE-190 budget (ADR-1252): 2000 Plans and 2000 to-dos per invocation, oldest hold first. A cut-off
// run costs an hour, not a send: a release is conditional on the hold day it read and every send
// carries an outbox dedupe key, so the next run resumes where this one stopped.
/**
 * Calendar holds cron (calendar suite pass 8, LIVE-1709). Hourly. Releases Pencil holds that lapsed,
 * warns the owner with one day left, and nudges the person a to-do was handed to the morning after
 * it slipped. Each Space is looked at in ONE local hour, so the work lands in its own morning.
 * Engine: lib/calendar/hold-lapse.ts (pure rules in hold-lapse-core.ts).
 *
 * Off until CALENDAR_HOLDS_ENABLED is set (activation gate in docs/RUNBOOKS.md): the release
 * tombstones dates, so it does not start by itself on deploy. A skipped run is reported.
 * Requires CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { envFlag } from '@/lib/env/string'
import { runCalendarHoldSweep } from '@/lib/calendar/hold-lapse'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  // Every fail-safe needs a gate that notices it fired: a skipped run is a log line, not silence.
  if (!envFlag('CALENDAR_HOLDS_ENABLED')) {
    log.info('cron.calendar_holds.skipped', { reason: 'CALENDAR_HOLDS_ENABLED is off' })
    return NextResponse.json({ ok: true, skipped: true, reason: 'CALENDAR_HOLDS_ENABLED is off' })
  }

  const budget = cronBudget(2000)
  const result = await runCalendarHoldSweep(new Date(), { limit: budget.items, exhausted: budget.exhausted })
  const summary = budget.summary(result.released + result.warned + result.nudged, result.remaining)
  log.info('cron.calendar_holds', { ...result, ...summary })
  return NextResponse.json({ ok: true, ...result, budget: summary })
}

export const GET = withCronHeartbeat('calendar-holds', handler)
