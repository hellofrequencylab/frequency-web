// Cron — embeds upcoming events for the "For You" matching engine
// (docs/EVENTS-SYSTEM.md §3). Cheap batch backfill (no insert trigger): newest
// starting first, so the soonest events are freshest. Called by Vercel Cron
// (see vercel.json). Requires CRON_SECRET. Mirrors embed-room-messages.

import { NextRequest, NextResponse } from 'next/server'
import { backfillEventEmbeddings } from '@/lib/events/embeddings'
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

  const result = await backfillEventEmbeddings(100)
  log.info('cron.embed_events', result)
  return NextResponse.json({ ok: true, ...result })
}
