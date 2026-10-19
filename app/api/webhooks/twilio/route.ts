// Twilio inbound + status-callback webhook (ADR-256). Twilio POSTs here for two
// things: an inbound SMS the member texted us (STOP / HELP / START / anything), and
// a delivery-status callback for a message we sent. Configure the Messaging Service's
// inbound + status callback URLs to point at this route in the Twilio console.
//
// Security: every request is verified with the X-Twilio-Signature header (HMAC-SHA1
// of the full URL + sorted POST params, keyed by TWILIO_AUTH_TOKEN) before anything
// is trusted — same manual-verify posture as the Resend webhook. A bad/absent
// signature is a 401. Verified, handled events always 200-ack so Twilio does not
// redeliver. Fail-closed: with no auth token set, every request is rejected.
//
// STOP handling is the compliance-critical leg: an inbound STOP/STOPALL/UNSUBSCRIBE
// propagates a GLOBAL opt-out (recordGlobalStop) across email + SMS at once. START /
// UNSTOP lifts that stop on the ledger (recordSmsRestart, ADR-1790). Twilio's Messaging
// Service auto-replies to STOP / START / HELP at the carrier level; this is our own
// record so the platform honours the member's choice everywhere immediately.
//
// Replies: an inbound-message webhook expects TwiML, so every verified inbound request
// gets an empty <Response/> (text/xml). Anything else makes Twilio log a warning on each
// text. Status callbacks accept any 2xx, so they keep the JSON ack.

import { NextResponse } from 'next/server'
import { recordGlobalStop, recordSmsRestart } from '@/lib/crm/contact-consent'
import { verifyTwilioSignature } from '@/lib/webhook-verify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Carrier-standard opt-out keywords. Twilio also recognises these at the carrier
// level, but we record our own global stop so every channel honours it at once.
const STOP_KEYWORDS = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit'])
// Carrier-standard re-subscribe keywords. Twilio lifts its own block on these; we lift ours.
const START_KEYWORDS = new Set(['start', 'unstop', 'yes'])
const HELP_KEYWORDS = new Set(['help', 'info'])

/** The empty TwiML Twilio expects back from an inbound-message webhook. */
function twiml(handled: string): Response {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { 'content-type': 'text/xml', 'x-frequency-handled': handled },
  })
}

/**
 * The public URL Twilio signed. Behind a proxy, `req.url` can be the internal origin,
 * which would break verification, so an explicit `TWILIO_WEBHOOK_URL` (the exact URL
 * configured in the Twilio console) takes precedence when set. Twilio includes the
 * query string in the signed URL, so we preserve it from req.url when falling back.
 */
function signedRequestUrl(req: Request): string {
  const override = process.env.TWILIO_WEBHOOK_URL
  if (override) {
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
    return override + qs
  }
  return req.url
}

export async function POST(req: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const signature = req.headers.get('x-twilio-signature')

  // Twilio sends application/x-www-form-urlencoded. Parse the body into a flat map
  // (the exact shape the signature is computed over).
  const raw = await req.text()
  const form = new URLSearchParams(raw)
  const params: Record<string, string> = {}
  for (const [k, v] of form.entries()) params[k] = v

  if (!authToken || !verifyTwilioSignature(authToken, signedRequestUrl(req), params, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  // ── Delivery status callback (we sent it; Twilio reports its fate) ──────────
  // Identified by a MessageStatus field (queued/sent/delivered/undelivered/failed)
  // and no inbound Body. Best-effort record only; always ack.
  const messageStatus = params.MessageStatus || params.SmsStatus
  const inboundBody = params.Body

  if (messageStatus && inboundBody === undefined) {
    // Best-effort: log the delivery status. A richer ledger (per-message status) can
    // hang off the message SID later; for now we surface it without failing the ack.
    console.info(
      `[twilio-webhook] status callback sid=${params.MessageSid ?? 'unknown'} status=${messageStatus}`,
    )
    return NextResponse.json({ ok: true })
  }

  // ── Inbound message (the member texted us) ─────────────────────────────────
  const from = (params.From || '').trim()
  const keyword = (inboundBody || '').trim().toLowerCase()

  if (from && STOP_KEYWORDS.has(keyword)) {
    // Global opt-out across every channel (email + SMS). Best-effort per leg inside
    // recordGlobalStop; we ack regardless so Twilio does not redeliver a STOP.
    try {
      await recordGlobalStop({ phone: from, reason: 'stop_reply', source: 'sms_webhook' })
    } catch (err) {
      console.error(
        `[twilio-webhook] recordGlobalStop failed for ${from}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    return twiml('stop')
  }

  if (from && START_KEYWORDS.has(keyword)) {
    // Lift our own stop for every member whose latest row on this phone is opted_out.
    // Best-effort (recordSmsRestart never throws); ack regardless.
    await recordSmsRestart({ phone: from, source: 'sms_webhook' })
    return twiml('start')
  }

  if (from && HELP_KEYWORDS.has(keyword)) {
    // HELP is carrier/Messaging-Service-handled (the configured auto-reply). We just
    // acknowledge; no state change. (See docs/A2P-REGISTRATION.md §4a #5 for the copy.)
    return twiml('help')
  }

  // Any other inbound message: acknowledge without acting. Retrying would not change
  // the outcome, so a 200 stops Twilio redelivering.
  return twiml('ack')
}
