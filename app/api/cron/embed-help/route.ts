// Cron — keeps the "Ask Vera" help index (help_chunks) in sync with the help
// articles. Idempotent + content-hashed, so a no-change run is cheap (no embed
// spend). Called by Vercel Cron (see vercel.json). Requires CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { reindexHelpChunks } from '@/lib/ai/help-index'
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

  const result = await reindexHelpChunks()
  log.info('cron.embed_help', result)
  return NextResponse.json({ ok: true, ...result })
}
