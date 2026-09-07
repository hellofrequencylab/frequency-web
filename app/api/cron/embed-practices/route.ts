// LIVE-190 budget (ADR-1252): 100 practices embedded per invocation; a null embedding is the cursor; the next run takes the next 100.
// The clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts; app/api/cron/budget.test.ts checks the
// declaration is applied, not merely written down.
// Cron — backfills practice embeddings for the Phase-1 hybrid search
// (docs/PRACTICE-LIBRARY.md §5, ADR-438). Cheap batch fill: practices with a null
// embedding, newest first. On-write generation handles the steady state
// (createPractice / updatePractice); this sweeps up the backlog + any write that
// missed (AI off at the time, transient embed failure). Called by Vercel Cron
// (see vercel.json). Requires CRON_SECRET. Mirrors embed-events.

import { NextRequest, NextResponse } from 'next/server'
import { backfillPracticeEmbeddings } from '@/lib/practices/embeddings'
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
  const result = await backfillPracticeEmbeddings(budget.items)
  const summary = budget.summary(result.embedded)
  log.info('cron.embed_practices', { ...result, ...summary })
  return NextResponse.json({ ok: true, ...result, budget: summary })
}

export const GET = withCronHeartbeat('embed-practices', handler)
