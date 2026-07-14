// Daily cron — the Vera OWNER BRIEF (CRM Master Build Plan · Phase 7). Composes each operator's top
// "Today" moves into a short brief and emails it (consent + suppression gated, frequency-capped,
// through the durable outbox). It turns Today from pull-only into the daily push the owner asked
// for, and NEVER acts on a card. Runs after refresh-traits so the brief reads tonight's scores.
// Called by Vercel Cron (see vercel.json). Requires CRON_SECRET.
//
// FAIL-SAFE: runOwnerBriefs never throws (per-recipient errors are swallowed), and the handler
// still wraps it so a green cron never becomes a 500 over a bad brief.

import { NextRequest, NextResponse } from 'next/server'
import { runOwnerBriefs } from '@/lib/ai/vera/owner-brief'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  try {
    const result = await log.time('cron.vera_owner_brief', () => runOwnerBriefs())
    // Explicit fields literal: OwnerBriefRunResult is an interface, which TS won't assign to log's
    // index-signature Fields type. A fresh literal of its numeric counts satisfies it.
    log.info('cron.vera_owner_brief.counts', {
      candidates: result.candidates, sent: result.sent, skipped: result.skipped, errors: result.errors,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch {
    return NextResponse.json({ error: 'owner brief run failed' }, { status: 500 })
  }
}

export const GET = withCronHeartbeat('vera-owner-brief', handler)
