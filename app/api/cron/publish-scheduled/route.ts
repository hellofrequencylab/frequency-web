// LIVE-190 budget (ADR-1252): 200 due dispatches per invocation; the status flip to published is the claim; oldest scheduled_for first.
// The clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts; app/api/cron/budget.test.ts checks the
// declaration is applied, not merely written down.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { log, briefError } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handler(request: Request) {
  const denied = rejectUnauthorizedCron(request)
  if (denied) return denied

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const budget = cronBudget(200)
  const { data: due, error } = await admin
    .from('dispatches')
    .select('id')
    .eq('status', 'draft')
    .not('scheduled_for', 'is', null)
    .lte('scheduled_for', now)
    .order('scheduled_for', { ascending: true })
    .limit(budget.items)
  if (error) {
    log.error('cron.publish_scheduled.fetch_failed', { error: briefError(error) })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!due || due.length === 0) {
    return NextResponse.json({ published: 0 })
  }

  const ids = due.map((d: { id: string }) => d.id)
  const { error: updateError } = await admin
    .from('dispatches')
    .update({ status: 'published', published_at: now, updated_at: now })
    .in('id', ids)

  if (updateError) {
    log.error('cron.publish_scheduled.update_failed', { error: updateError.message })
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  revalidatePath('/nearby')
  revalidatePath('/feed')
  revalidatePath('/admin/dispatches')

  const summary = budget.summary(ids.length)
  log.info('cron.publish_scheduled', { published: ids.length, ...summary })
  return NextResponse.json({ published: ids.length, ids, budget: summary })
}

export const GET = withCronHeartbeat('publish-scheduled', handler)
