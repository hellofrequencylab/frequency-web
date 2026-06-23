// The Twilio provider call + the durable SMS enqueue helper (ADR-256, the SMS legal
// track landing). Mirrors lib/email.ts's `sendRawEmail` / `enqueueEmail` split:
//
//   • sendRawSms({to, body})  — the low-level provider POST, called by the queue's
//     `sms` handler. Throws on a provider error so the outbox retries; no-ops (and
//     returns null) when the env is not provisioned, so it stays fail-closed.
//   • enqueueSms(args)        — drop an SMS onto the durable notification_queue
//     (kind 'sms'), drained by /api/cron/process-queue with retries + backoff.
//
// Dependency-free: a plain `fetch` against the Twilio Messages REST API with HTTP
// Basic auth (ACCOUNT_SID:AUTH_TOKEN), exactly like lib/integrations/google/oauth.ts
// uses fetch and lib/wallet/google.ts uses node:crypto — no `twilio` npm dependency.
//
// Server-only: the auth token is read from the environment and never client-exposed.

import { enqueue } from '@/lib/queue/outbox'
import { isSmsProvisioned } from '@/lib/comms/sms'

const MESSAGES_API_BASE = 'https://api.twilio.com/2010-04-01/Accounts'

export interface RawSmsArgs {
  /** The destination phone number in E.164 (e.g. +15555550123). */
  to: string
  /** The message body. Twilio segments/encodes it; we send it verbatim. */
  body: string
}

/**
 * POST one message to the Twilio Messages API and return the message SID, or throw on
 * a provider error (so the outbox retries). Returns null when SMS is not provisioned
 * (the fail-closed default) — there is no provider to call, so this is a no-op, NOT a
 * throw, mirroring sendRawEmail's no-op when RESEND_API_KEY is unset.
 *
 * Auth is HTTP Basic with the account SID as the username and the auth token as the
 * password (Twilio's documented scheme). The body params are form-encoded:
 * MessagingServiceSid (the A2P-10DLC-mapped service), To, Body. The Messaging Service
 * (not a raw From number) is required so every send rides the registered campaign.
 */
export async function sendRawSms(args: RawSmsArgs): Promise<string | null> {
  // Fail-closed: never reach the provider unless every legal/provisioning flag is set.
  if (!isSmsProvisioned()) {
    console.warn('[sms] sendRawSms skipped — SMS is not provisioned (ADR-256); not sent.')
    return null
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
  // isSmsProvisioned() already requires messagingServiceSid; the account credentials are
  // the additional pair the actual POST needs. Treat their absence as not-provisioned.
  if (!accountSid || !authToken || !messagingServiceSid) {
    console.warn('[sms] sendRawSms skipped — Twilio credentials incomplete; not sent.')
    return null
  }

  const to = args.to.trim()
  const body = args.body
  if (!to || !body) throw new Error('[sms] sendRawSms requires both `to` and `body`')

  const url = `${MESSAGES_API_BASE}/${encodeURIComponent(accountSid)}/Messages.json`
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      MessagingServiceSid: messagingServiceSid,
      To: to,
      Body: body,
    }).toString(),
  })

  if (!res.ok) {
    // Surface Twilio's error body (never the auth token — it lives in a header, not the
    // body) so a dead-lettered job is debuggable.
    const detail = await res.text().catch(() => '')
    throw new Error(`[sms] Twilio send failed (${res.status}): ${detail.slice(0, 500)}`)
  }

  const json = (await res.json().catch(() => null)) as { sid?: string } | null
  return json?.sid ?? null
}

export interface EnqueueSmsArgs {
  /** The destination phone number in E.164. */
  to: string
  /** The message body. */
  body: string
  /** The owning profile, recorded on the contact_interaction by the handler. */
  profileId?: string | null
}

/**
 * Enqueue an SMS onto the durable outbox (kind 'sms'). Mirrors enqueueEmail: new SMS
 * paths go through this, not an inline send, so a provider blip retries with backoff
 * instead of dropping the message. The drain runs the `sms` handler in lib/queue/handlers.
 */
export async function enqueueSms(args: EnqueueSmsArgs): Promise<void> {
  await enqueue('sms', {
    to: args.to,
    body: args.body,
    profileId: args.profileId ?? null,
  })
}
