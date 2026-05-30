// Drains the durable job queue (lib/queue/outbox) with retries + backoff.
// Register a handler per job `kind` below as flows migrate onto the queue.

import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { processQueue } from '@/lib/queue/outbox'
import { queueHandlers } from '@/lib/queue/handlers'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const result = await processQueue(queueHandlers)
  return NextResponse.json({ ok: true, ...result })
}
