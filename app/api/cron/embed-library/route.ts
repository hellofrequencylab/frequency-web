// LIVE-190 budget (ADR-1252): 500 assets scanned per invocation; a null embedding is the cursor; the next run takes the next 500.
// The clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts; app/api/cron/budget.test.ts checks the
// declaration is applied, not merely written down.
// Cron — keeps The Loom's semantic-search index in sync: embeds library_assets whose text is new
// or changed (content-hash gated, so a no-change run is cheap). Reuses the key-free gte-small
// `embed` edge function. Called by Vercel Cron (see vercel.json). Requires CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { reindexLibraryEmbeddings } from '@/lib/library/embeddings'
import { aiAvailable } from '@/lib/ai/usage'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  // Respect the AI kill switch — no embedding while AI is off.
  if (!(await aiAvailable())) {
    return NextResponse.json({ ok: true, skipped: 'ai_disabled' })
  }

  const budget = cronBudget(500)
  const result = await reindexLibraryEmbeddings(budget.items)
  const summary = budget.summary(result.scanned)
  log.info('cron.embed_library', { ...result, ...summary })
  return NextResponse.json({ ok: true, ...result, budget: summary })
}

export const GET = withCronHeartbeat('embed-library', handler)
