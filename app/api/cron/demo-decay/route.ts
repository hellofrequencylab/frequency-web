import { NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { runDecay } from '@/lib/demo/decay'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Nightly: recede + purge demo content as each area goes real (ADR-081, Phase 3).
// Pass ?dry=1 to report without writing.
export async function GET(request: Request) {
  const denied = rejectUnauthorizedCron(request)
  if (denied) return denied

  const dry = new URL(request.url).searchParams.get('dry') === '1'
  try {
    const report = await runDecay({ dryRun: dry })
    return NextResponse.json(report)
  } catch (e) {
    log.error('cron.demo_decay.failed', { error: e instanceof Error ? e.message : String(e) })
    return NextResponse.json({ error: 'decay failed' }, { status: 500 })
  }
}
