// Resend webhook (Phase 6.2): records delivery/engagement events and auto-suppresses
// hard bounces + spam complaints. Configure in the Resend dashboard with this URL and
// set RESEND_WEBHOOK_SECRET (the "whsec_..." signing secret). Signature is verified
// Svix-style with Node crypto (no svix dependency).

import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { recordEmailEvent, suppress } from '@/lib/suppression'

export const dynamic = 'force-dynamic'

function verifySignature(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
  signatureHeader: string,
): boolean {
  try {
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
    const expected = crypto
      .createHmac('sha256', key)
      .update(`${id}.${timestamp}.${body}`)
      .digest('base64')
    const expectedBuf = Buffer.from(expected)
    // svix-signature is a space-separated list of "v1,<base64sig>" entries.
    return signatureHeader.split(' ').some((part) => {
      const sig = part.split(',')[1]
      if (!sig) return false
      const sigBuf = Buffer.from(sig)
      return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)
    })
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  const id = req.headers.get('svix-id')
  const timestamp = req.headers.get('svix-timestamp')
  const signature = req.headers.get('svix-signature')
  const body = await req.text()

  if (!secret || !id || !timestamp || !signature || !verifySignature(secret, id, timestamp, body, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let event: { type?: string; data?: { to?: string | string[]; email_id?: string } }
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'bad body' }, { status: 400 })
  }

  const type = (event.type ?? '').replace(/^email\./, '') || 'unknown'
  const to = Array.isArray(event.data?.to) ? event.data?.to[0] : event.data?.to

  if (to) {
    await recordEmailEvent({
      email: to,
      eventType: type,
      providerId: event.data?.email_id ?? null,
      payload: event as Record<string, unknown>,
    })
    // Hard bounce / complaint → never send to this address again.
    if (type === 'bounced' || type === 'complained') {
      await suppress(to, type === 'bounced' ? 'hard_bounce' : 'complaint')
    }
  }

  return NextResponse.json({ ok: true })
}
