/**
 * Practice lifecycle cron (ADR-920 Phase 3). Hourly. Two jobs in one pass, both idempotent:
 *
 *   1. TERM COMPLETIONS — retire active self-adopted commitments whose ends_on has passed in
 *      the member's OWN calendar (reason 'completed') and send the completion notice with the
 *      re-adopt door. Hourly so the celebration lands within an hour of local midnight, in
 *      every timezone, instead of at one fixed UTC moment.
 *
 *   2. DAILY REMINDERS — at most one nudge a day per member, in the hour they usually
 *      practice (derived from their own log history, tz-correct via profiles.home_timezone),
 *      only while something is still unlogged today. Gated by the `practice` notification
 *      category (in-app default-on; push opt-in).
 *
 * Requires CRON_SECRET. Engine: lib/practices/lifecycle.ts (pure core + IO sweep).
 */

import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { runPracticeLifecycleSweep } from '@/lib/practices/lifecycle'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'
// The reminder pass is a bounded per-member loop; give it the full cron window so a slow
// hour degrades to "finished late," never "died mid-loop with errors swallowed."
export const maxDuration = 300

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const result = await runPracticeLifecycleSweep()
  log.info('cron.practice_lifecycle', { ...result })
  return NextResponse.json({ ok: true, ...result })
}

export const GET = withCronHeartbeat('practice-lifecycle', handler)
