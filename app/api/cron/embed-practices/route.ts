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
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  // Respect the AI kill switch — no embedding spend while AI is off.
  if (!(await aiAvailable())) {
    return NextResponse.json({ ok: true, skipped: 'ai_disabled' })
  }

  const result = await backfillPracticeEmbeddings(100)
  log.info('cron.embed_practices', result)
  return NextResponse.json({ ok: true, ...result })
}
