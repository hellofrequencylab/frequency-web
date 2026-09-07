// LIVE-190 budget (ADR-1252): BOUNDED BY DESIGN. The corpus is content/help in this repo (57 files
// today), every chunk is hash-skipped when unchanged, and one run always finishes the corpus, so
// the stated 500 chunks is a ceiling on the corpus, not a batch the run takes from a queue.
// app/api/cron/budget.test.ts names this route in BOUNDED_BY_DESIGN with that reason.
// Cron — keeps the "Ask Vera" help index (help_chunks) in sync with the help
// articles. Idempotent + content-hashed, so a no-change run is cheap (no embed
// spend). Called by Vercel Cron (see vercel.json). Requires CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { reindexHelpChunks } from '@/lib/ai/help-index'
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

  const budget = cronBudget(500)
  const result = await reindexHelpChunks()
  const summary = budget.summary(result.chunks, 0)
  log.info('cron.embed_help', { ...result, ...summary })
  return NextResponse.json({ ok: true, ...result, budget: summary })
}

export const GET = withCronHeartbeat('embed-help', handler)
