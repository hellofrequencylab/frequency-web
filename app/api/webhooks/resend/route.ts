// Resend webhook (Phase 6.2): records delivery/engagement events and auto-suppresses
// hard bounces + spam complaints. Configure in the Resend dashboard with this URL and
// set RESEND_WEBHOOK_SECRET (the "whsec_..." signing secret). Signature is verified
// Svix-style with Node crypto (no svix dependency).

import { NextResponse } from 'next/server'
import { recordEmailEvent, suppress } from '@/lib/suppression'
import { verifyResendSignature } from '@/lib/webhook-verify'
import { handleSpaceSendWebhook } from '@/lib/spaces/email'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  const id = req.headers.get('svix-id')
  const timestamp = req.headers.get('svix-timestamp')
  const signature = req.headers.get('svix-signature')
  const body = await req.text()

  if (!secret || !id || !timestamp || !signature || !verifyResendSignature(secret, id, timestamp, body, signature)) {
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

  // Unmappable event (no recipient): acknowledge with 200. Retrying won't add
  // the missing field, so a non-2xx would only make Resend redeliver forever.
  // Log it so silently-skipped events are still visible.
  if (!to) {
    console.warn(`[resend-webhook] skipped event with no recipient (type=${type}, id=${id})`)
    return NextResponse.json({ ok: true, skipped: 'no recipient' })
  }

  // Suppression is the delivery-integrity-critical step, so run it first and
  // independently from the analytics log: a failure to record an event must not
  // stop us from suppressing a bouncing/complaining address, and vice versa.
  // Any failure is logged and returns 503 so Resend redelivers (suppress() is
  // idempotent; a redelivered event row is acceptable). Without this, an
  // unhandled throw became an unlogged 500 and the integrity signal was lost.
  const errors: string[] = []

  if (type === 'bounced' || type === 'complained') {
    try {
      await suppress(to, type === 'bounced' ? 'hard_bounce' : 'complaint')
    } catch (err) {
      errors.push(`suppress: ${err instanceof Error ? err.message : String(err)}`)
    }
    // ALSO update a per-Space send (ENTITY-SPACES-BUILD Phase 3): if this Resend id belongs to a
    // Space's outreach_sends row, set that row's status and add a SPACE-SCOPED suppression. Best-
    // effort + additive: the global suppression above is unchanged, and a failure here is logged
    // (not fatal) so the global integrity signal still drives the response.
    try {
      await handleSpaceSendWebhook(event.data?.email_id ?? null, type)
    } catch (err) {
      errors.push(`spaceSend: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  try {
    await recordEmailEvent({
      email: to,
      eventType: type,
      providerId: event.data?.email_id ?? null,
      payload: event as Record<string, unknown>,
    })
  } catch (err) {
    errors.push(`recordEmailEvent: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (errors.length > 0) {
    console.error(`[resend-webhook] processing failed (type=${type}, id=${id}): ${errors.join('; ')}`)
    return NextResponse.json({ ok: false, error: 'processing failed' }, { status: 503 })
  }

  return NextResponse.json({ ok: true })
}
