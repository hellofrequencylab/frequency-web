// Freshness of the crons that have no Healthchecks check (SEC-022). Read by the queue-watch GitHub
// workflow, so a stopped job is a red run and GitHub emails the owner. See lib/observability/cron-last-success.ts.
//
// SAFE TO PUBLISH: job route names and ages in minutes. No ids, no member data. Never cached.

import { NextResponse } from 'next/server'
import { readCronStamps } from '@/lib/observability/cron-last-success'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { measured, stamps } = await readCronStamps()
  const stale = stamps.filter((s) => s.state === 'stale').map((s) => s.job)
  const ok = measured && stale.length === 0
  return NextResponse.json(
    { ok, measured, stale, unreported: stamps.filter((s) => s.state === 'unreported').map((s) => s.job), stamps },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
