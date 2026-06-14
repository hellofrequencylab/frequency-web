// Daily cron — compresses Vera's per-member memory so it stays bounded and useful
// as context (build-list P6 §2.3, AI-VERA.md §5, ADR-066). Member memory
// accumulates facts + a rolling summary but is never compressed; this batch
// summarizes the members whose memory has grown large or gone stale. Called by
// Vercel Cron (see vercel.json). Requires CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { summarizeVeraMemory } from '@/lib/ai/memory-summary'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const result = await summarizeVeraMemory()
  log.info('cron.summarize_vera_memory', result)

  return NextResponse.json({ ok: true, ...result })
}
