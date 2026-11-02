// Live queue-lag reading for an outside watcher (SEC-021, the second clock for AUD-3).
//
// Vercel Cron is the only scheduler, and Healthchecks pings come from the same crons they watch. If the
// scheduler stops, `process-queue` stops draining and nothing inside the app can say so. This route
// reports how long the oldest DUE job has waited, so a pinger that does not run on Vercel (the
// queue-watch GitHub workflow) can fail loudly when the lag grows.
//
// SAFE TO PUBLISH: three numbers and two booleans. No job content, no ids, no member data.
// Never cached: a stale answer is the one failure this exists to catch.

import { NextResponse } from 'next/server'
import { queueHealth } from '@/lib/queue/outbox'

export const dynamic = 'force-dynamic'

/** Past this many minutes the watcher fails. `process-queue` runs every 2 minutes and the SLO target is 10. */
export const QUEUE_LAG_ALERT_MIN = 15

export async function GET() {
  const h = await queueHealth()
  const ok = h.measured && h.lagMin <= QUEUE_LAG_ALERT_MIN
  return NextResponse.json(
    { ok, measured: h.measured, lagMin: h.lagMin, pending: h.pending, deadLettered: h.deadLettered, alertAfterMin: QUEUE_LAG_ALERT_MIN },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
