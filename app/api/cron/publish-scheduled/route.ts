// LIVE-190 budget (ADR-1252): 200 due dispatches per invocation; the status flip to published is the claim (conditional on
// status = draft, so an overlapping run cannot claim the same row); oldest scheduled_for first. Each claimed Dispatch is
// then emailed and pushed to its audience through lib/dispatches/fan-out (SCAN-756); it used to flip status only.
// The clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts; app/api/cron/budget.test.ts checks the
// declaration is applied, not merely written down.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { log, briefError } from '@/lib/log'
import { refreshSite } from '@/lib/sites/site-cache'
import { notifyDispatchAudience } from '@/lib/dispatches/fan-out'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handler(request: Request) {
  const denied = rejectUnauthorizedCron(request)
  if (denied) return denied

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const budget = cronBudget(200)
  const websiteRpc = admin as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: { slug: string }[] | null; error: unknown }> }
  let websites: { data: { slug: string }[] | null; error: unknown }
  try { websites = await websiteRpc.rpc('publish_due_websites', { p_now: now }) }
  catch (error) { websites = { data: null, error } }
  if (websites.error) {
    log.error('cron.publish_scheduled.websites_failed', { error: briefError(websites.error) })
  }
  for (const site of websites.data ?? []) refreshSite(site.slug)
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
    return NextResponse.json({ published: 0, websites: websites.data?.length ?? 0, websiteError: !!websites.error }, { status: websites.error ? 500 : 200 })
  }

  const dueIds = due.map((d: { id: string }) => d.id)
  const { data: claimed, error: updateError } = await admin
    .from('dispatches')
    .update({ status: 'published', published_at: now, updated_at: now })
    .in('id', dueIds)
    .eq('status', 'draft')
    .select('id')

  if (updateError) {
    log.error('cron.publish_scheduled.update_failed', { error: updateError.message })
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }
  const ids = (claimed ?? []).map((d: { id: string }) => d.id)

  revalidatePath('/nearby')
  revalidatePath('/feed')
  revalidatePath('/admin/dispatches')

  // The fan-out the immediate publish does, for each Dispatch this run claimed. Per id, within the
  // budget; a Dispatch whose fan-out does not fit stays published and is logged, never re-sent.
  let notified = 0
  let reached = 0
  for (const id of ids) {
    if (budget.exhausted()) {
      log.warn('cron.publish_scheduled.fan_out_deferred', { id, remaining: ids.length - notified })
      break
    }
    try {
      reached += await notifyDispatchAudience(admin, id)
      notified++
    } catch (err) {
      log.error('cron.publish_scheduled.fan_out_failed', { id, error: briefError(err) })
    }
  }

  const summary = budget.summary(ids.length)
  log.info('cron.publish_scheduled', { published: ids.length, notified, reached, ...summary })
  return NextResponse.json({ published: ids.length, ids, notified, reached, budget: summary, websites: websites.data?.length ?? 0, websiteError: !!websites.error }, { status: websites.error ? 500 : 200 })
}

export const GET = withCronHeartbeat('publish-scheduled', handler)
