// Cron — keeps The Loom's semantic-search index in sync: embeds library_assets whose text is new
// or changed (content-hash gated, so a no-change run is cheap). Reuses the key-free gte-small
// `embed` edge function. Called by Vercel Cron (see vercel.json). Requires CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { reindexLibraryEmbeddings } from '@/lib/library/embeddings'
import { aiAvailable } from '@/lib/ai/usage'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  // Respect the AI kill switch — no embedding while AI is off.
  if (!(await aiAvailable())) {
    return NextResponse.json({ ok: true, skipped: 'ai_disabled' })
  }

  const result = await reindexLibraryEmbeddings()
  log.info('cron.embed_library', result)
  return NextResponse.json({ ok: true, ...result })
}

export const GET = withCronHeartbeat('embed-library', handler)
