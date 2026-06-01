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

  try {
    const result = await processQueue(queueHandlers)
    // Surface dead-letters in the cron's own logs so a backlog of dropped
    // side-effects is visible without inspecting the table by hand (ADR-043).
    if (result.failed > 0) {
      console.error(`[process-queue] ${result.failed} job(s) dead-lettered this drain`)
    }
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[process-queue] drain failed: ${msg}`)
    // 500 so the failure is recorded; the next scheduled cron retries the drain.
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
