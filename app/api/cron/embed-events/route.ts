// LIVE-190 budget (ADR-1252): 100 events embedded per invocation; a missing embedding is the cursor; the next run takes the next 100.
// The clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts; app/api/cron/budget.test.ts checks the
// declaration is applied, not merely written down.
// Cron — embeds upcoming events for the "For You" matching engine
// (docs/EVENTS-SYSTEM.md §3). Cheap batch backfill (no insert trigger): newest
// starting first, so the soonest events are freshest. Called by Vercel Cron
// (see vercel.json). Requires CRON_SECRET. Mirrors embed-room-messages.

import { NextRequest, NextResponse } from 'next/server'
import { backfillEventEmbeddings } from '@/lib/events/embeddings'
import { aiAvailable } from '@/lib/ai/usage'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  // Respect the AI kill switch — no embedding spend while AI is off.
  if (!(await aiAvailable())) {
    return NextResponse.json({ ok: true, skipped: 'ai_disabled' })
  }

  const budget = cronBudget(100)
  const result = await backfillEventEmbeddings(budget.items)
  const summary = budget.summary(result.embedded)
  log.info('cron.embed_events', { ...result, ...summary })
  return NextResponse.json({ ok: true, ...result, budget: summary })
}

export const GET = withCronHeartbeat('embed-events', handler)
