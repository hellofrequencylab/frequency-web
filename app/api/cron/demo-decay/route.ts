// LIVE-190 budget (ADR-1252): 500 real circles walked per invocation; every circle is idempotent, so a cut-off run leaves the rest for tomorrow and says how many.
// The clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts; app/api/cron/budget.test.ts checks the
// declaration is applied, not merely written down.
import { NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { runDecay } from '@/lib/demo/decay'
import { log, briefError } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Nightly: recede + purge demo content as each area goes real (ADR-081, Phase 3).
// Pass ?dry=1 to report without writing.
async function handler(request: Request) {
  const denied = rejectUnauthorizedCron(request)
  if (denied) return denied

  const dry = new URL(request.url).searchParams.get('dry') === '1'
  try {
    const budget = cronBudget(500)
    const report = await runDecay({ dryRun: dry, limit: budget.items, exhausted: budget.exhausted })
    const summary = budget.summary(report.visited, report.remaining)
    log.info('cron.demo_decay', { ...report, ...summary })
    return NextResponse.json({ ...report, budget: summary })
  } catch (e) {
    log.error('cron.demo_decay.failed', { error: briefError(e) })
    return NextResponse.json({ error: 'decay failed' }, { status: 500 })
  }
}

export const GET = withCronHeartbeat('demo-decay', handler)
