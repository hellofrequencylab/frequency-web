// LIVE-2265 budget (ADR-1252): 300 emails per invocation across every quiet campaign; each campaign's send ledger is the
// claim, so a reached member leaves the next run's due list; the remainder is the next day's head.
// The clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts; app/api/cron/budget.test.ts checks the
// declaration is applied, not merely written down.
/**
 * Quiet-member re-engagement (LIVE-2265). Runs daily via Vercel Cron.
 *
 * For each Email Studio campaign aimed at a quiet audience (quiet_14 / quiet_30 / quiet_60) that the owner approved in
 * the approval queue, sends it to the opted-in members who newly went that many days without a visit, once per person.
 * The audience is lib/studio/campaigns.ts, the window lib/email-studio/quiet.ts, the send sendQuietCampaign in
 * lib/email-studio/send.ts; this file is the auth, the switch, the budget and the heartbeat.
 *
 * Dark until QUIET_REENGAGE_ENABLED is set (docs/RUNBOOKS.md, "Quiet-member re-engagement"). A skipped run is logged,
 * not silent. A campaign that fails is counted and the run answers 500 so the heartbeat fail-pings.
 *
 * Requires CRON_SECRET env var for security.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { QUIET_SEGMENT_DAYS, quietReengageEnabled } from '@/lib/email-studio/quiet'
import { sendQuietCampaign } from '@/lib/email-studio/send'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  if (!quietReengageEnabled()) {
    log.info('cron.quiet_reengage.skipped', { reason: 'QUIET_REENGAGE_ENABLED is off' })
    return NextResponse.json({ skipped: true, reason: 'QUIET_REENGAGE_ENABLED is off' })
  }

  const budget = cronBudget(300)
  const db = createAdminClient()
  const { data, error } = await db
    .from('campaigns')
    .select('id, segment')
    .in('segment', Object.keys(QUIET_SEGMENT_DAYS))
    .in('approval_status', ['approved', 'scheduled'])
    .not('status', 'in', '(paused,cancelled,sent)')
    .order('created_at', { ascending: true })
  if (error) {
    log.error('cron.quiet_reengage.read_failed', { error: error.message })
    return NextResponse.json({ error: 'quiet re-engagement read failed' }, { status: 500 })
  }

  let left = budget.items
  let queued = 0
  let remaining = 0
  let failed = 0
  for (const c of data ?? []) {
    if (left <= 0 || budget.exhausted()) break
    const res = await sendQuietCampaign(String(c.id), left)
    if ('error' in res) {
      failed++
      log.error('cron.quiet_reengage.campaign_failed', { campaignId: c.id, error: res.error })
      continue
    }
    queued += res.data.queued
    remaining += res.data.remaining
    left -= res.data.queued
  }
  const summary = budget.summary(queued, remaining)
  log.info('[quiet-reengage] run', { campaigns: (data ?? []).length, queued, failed, ...summary })
  return NextResponse.json({ ok: failed === 0, campaigns: (data ?? []).length, queued, failed, budget: summary }, { status: failed === 0 ? 200 : 500 })
}

export const GET = withCronHeartbeat('quiet-reengage', handler)
