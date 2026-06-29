// Cron — embeds new room messages for semantic search (Phase C, ADR-088 §6).
// Cheap batch backfill (no insert trigger): newest-unembedded first, so search
// stays fresh. Called by Vercel Cron (see vercel.json). Requires CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { embedRoomMessageBacklog } from '@/lib/ai/room-search'
import { aiAvailable } from '@/lib/ai/usage'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  // Respect the AI kill switch — no embedding spend while AI is off.
  if (!(await aiAvailable())) {
    return NextResponse.json({ ok: true, skipped: 'ai_disabled' })
  }

  const result = await embedRoomMessageBacklog(150)
  log.info('cron.embed_room_messages', result)
  return NextResponse.json({ ok: true, ...result })
}

export const GET = withCronHeartbeat('embed-room-messages', handler)
