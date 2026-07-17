// INBOUND EMAIL WEBHOOK (ADR-629) — the RECEIVE half of the CRM 2-way inbox. A provider (Resend
// inbound / an inbound-parse address) POSTs a received email here; we verify the signature, parse the
// payload, match the from-address to a contact, and land the message on the ONE contact_interactions
// timeline as an INBOUND email (via lib/crm/inbox.ts → recordContactInteraction). It then appears in
// the thread above the reply composer, completing the two-way loop.
//
// ⚠️ NEEDS PROVIDER CONFIG TO GO LIVE. Nothing here invents a provider secret. Set:
//   • RESEND_INBOUND_WEBHOOK_SECRET — the Svix signing secret for THIS endpoint (create an inbound
//     route / parse webhook in the provider dashboard pointing at /api/webhooks/inbound-email).
//   • CRM_INBOX_OWNER_PROFILE_ID    — the profile that owns a platform inbound touch from a pure lead
//     (a member's own profile owns the touch when the contact is a member).
// Until RESEND_INBOUND_WEBHOOK_SECRET is set, every request is rejected (401) — the seam is inert but
// wired, exactly as intended for a scaffold. Modeled on app/api/webhooks/resend/route.ts (Svix verify
// + always 200-ack a verified-but-unactionable event so the provider stops redelivering).

import { NextResponse } from 'next/server'
import { verifyResendSignature, isFreshTimestamp } from '@/lib/webhook-verify'
import { parseInboundEmailPayload, recordInboundEmail } from '@/lib/crm/inbox'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: Request) {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET
  const id = req.headers.get('svix-id')
  const timestamp = req.headers.get('svix-timestamp')
  const signature = req.headers.get('svix-signature')
  const body = await req.text()

  // No secret configured ⇒ the seam is not live yet. Reject rather than trust an unsigned payload.
  if (!secret || !id || !timestamp || !signature || !verifyResendSignature(secret, id, timestamp, body, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }
  // Replay guard (checked AFTER the signature so we never trust an unverified timestamp).
  if (!isFreshTimestamp(timestamp)) {
    return NextResponse.json({ error: 'stale timestamp' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'bad body' }, { status: 400 })
  }

  const parsed = parseInboundEmailPayload(payload)
  if (!parsed) {
    // Verified but unactionable (no from-address). 200-ack so the provider stops redelivering.
    console.warn('[inbound-email] skipped: no usable from-address')
    return NextResponse.json({ ok: true, skipped: 'no from-address' })
  }

  // Best-effort record (never integrity-critical): a write blip should not force a redelivery.
  const result = await recordInboundEmail(parsed)
  if (result.status !== 'recorded') {
    // Log the status only — never the user-controlled from-address (log-injection sink, CodeQL).
    console.warn(`[inbound-email] not recorded (${result.status})`)
  }
  return NextResponse.json({ ok: true, status: result.status })
}
