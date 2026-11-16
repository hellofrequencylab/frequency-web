// Freshness of the crons that have no Healthchecks check (SEC-022). Read by the queue-watch GitHub
// workflow, so a stopped job is a red run and GitHub emails the owner. See lib/observability/cron-last-success.ts.
//
// SAFE TO PUBLISH: job route names and ages in minutes. No ids, no member data. Never cached.

import { NextResponse } from 'next/server'
import { clientIp, rateLimitOk, tooMany } from '@/lib/rate-limit'
import { readCronStamps } from '@/lib/observability/cron-last-success'

export const dynamic = 'force-dynamic'

export async function GET(req?: Request) {
  // Unauthenticated and it reads the database, so it is throttled per address (SCAN-1239). A watcher polls a few
  // times an hour. 'allow' when KV is unset: the watcher must never be locked out of the one signal it exists for.
  if (!(await rateLimitOk('status-cron-freshness', req ? clientIp(req) : 'unknown', 30, '1 m', { whenUnconfigured: 'allow' }))) return tooMany()
  const { measured, stamps } = await readCronStamps()
  const stale = stamps.filter((s) => s.state === 'stale').map((s) => s.job)
  const ok = measured && stale.length === 0
  return NextResponse.json(
    { ok, measured, stale, unreported: stamps.filter((s) => s.state === 'unreported').map((s) => s.job), stamps },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
