// Drains the durable job queue (lib/queue/outbox) with retries + backoff.
// Register a handler per job `kind` below as flows migrate onto the queue.

import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { processQueue, type JobHandler } from '@/lib/queue/outbox'
import { sendPushToProfile } from '@/lib/push'
import { sendRawEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

const handlers: Record<string, JobHandler> = {
  // Durable web push (P1.4 + P7.29). payload: { profileId, payload: PushPayload }.
  push: async (p) => {
    const profileId = p.profileId as string
    if (!profileId || !p.payload) return
    await sendPushToProfile(profileId, p.payload as Parameters<typeof sendPushToProfile>[1])
  },
  // Durable email (ADR-026). payload: { to, subject, html, text? }.
  email: async (p) => {
    if (!p.to || !p.subject) return
    await sendRawEmail({
      to: p.to as string,
      subject: p.subject as string,
      html: (p.html as string) ?? '',
      text: typeof p.text === 'string' ? p.text : undefined,
    })
  },
  // fanout / leaderboard handlers register here as those flows move to the queue.
}

export async function GET(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const result = await processQueue(handlers)
  return NextResponse.json({ ok: true, ...result })
}
