import { NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget, CRON_TIME_BUDGET_MS } from '@/lib/cron/budget'
import { runGuidanceWatch } from '@/lib/ai/discovery-guidance-watch'
import { guidanceWatchDependencies } from '@/lib/ai/discovery-guidance-store'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'
async function handler(req: Request) {
  // Strict even in local development: this endpoint persists an operational baseline.
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'Server misconfigured' }, { status: 401 })
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied
  const budget = cronBudget(3)
  try {
    const result = await runGuidanceWatch(guidanceWatchDependencies(budget.exhausted))
    const summary = budget.summary(result.processed, result.remaining)
    if (result.report.some(source => source.status === 'review_required')) log.warn('discovery.guidance.human_review_required', { sources: result.report.filter(source => source.status === 'review_required') })
    if (result.errors) log.warn('discovery.guidance.sources_unavailable', { errors: result.errors })
    return NextResponse.json({ ok: result.errors === 0 && result.remaining === 0, ...result, budget: summary, effect: 'human review only; no content or policy changed' }, { status: result.errors || result.remaining ? 503 : 200 })
  } catch {
    log.warn('discovery.guidance.watch_failed', {})
    return NextResponse.json({ error: 'Guidance watch unavailable; baseline was not reset' }, { status: 503 })
  }
}
export const GET = withCronHeartbeat('discovery-guidance-watch', handler, { budgetMs: CRON_TIME_BUDGET_MS })
