// LIVE-190 budget (ADR-1252): 50 members claimed for compression per invocation; the claim in claimMembersDueForSummary is the cursor.
// The clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts; app/api/cron/budget.test.ts checks the
// declaration is applied, not merely written down.
// Daily cron — compresses Vera's per-member memory so it stays bounded and useful
// as context (build-list P6 §2.3, AI-VERA.md §5, ADR-066). Member memory
// accumulates facts + a rolling summary but is never compressed; this batch
// summarizes the members whose memory has grown large or gone stale. Called by
// Vercel Cron (see vercel.json). Requires CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { summarizeVeraMemory } from '@/lib/ai/memory-summary'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const budget = cronBudget(50)
  const result = await summarizeVeraMemory({ limit: budget.items })
  const summary = budget.summary(result.scanned)
  log.info('cron.summarize_vera_memory', { ...result, ...summary })
  return NextResponse.json({ ok: true, ...result, budget: summary })
}

export const GET = withCronHeartbeat('summarize-vera-memory', handler)
