// Resend webhook (Phase 6.2): records delivery/engagement events and auto-suppresses
// hard bounces + spam complaints. Configure in the Resend dashboard with this URL and
// set RESEND_WEBHOOK_SECRET (the "whsec_..." signing secret). Signature is verified
// Svix-style with Node crypto (no svix dependency).
//
// EXACTLY ONCE (scan2 L2-05, 2026-09-05). Resend redelivers until it gets a 2xx, and every delivery
// used to append its own email_events row, so a retry over-counted opens, clicks, bounces and
// complaints for every reader of that table. The route now CLAIMS the svix-id in
// email_webhook_events (20270345000800) right after the signature check, exactly as the Stripe
// webhook claims stripe_webhook_events: a duplicate answers 200 and does nothing, any other claim
// error answers 500 so Resend retries into a working claim. The steps after the claim are ordered
// so the email_events row is appended LAST, and a 503 is only ever sent BEFORE that append (with
// the claim released so the retry re-processes) or when the append itself failed (nothing was
// written). Nothing after a successful append can turn into a retry.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordEmailEvent, suppress } from '@/lib/suppression'
import { verifyResendSignature, isFreshTimestamp } from '@/lib/webhook-verify'
import { handleSpaceSendWebhook, handleSpaceSendEngagement } from '@/lib/spaces/email'
import { mapResendEventToInteraction, type ResendTimelineEventType } from '@/lib/spaces/email-timeline'

export const dynamic = 'force-dynamic'

/** The idempotency ledger, through the service-role client. The table landed in 20270345000800; the
 *  generated types are regenerated after apply, so the seam is typed by hand here. */
interface WebhookEventsTable {
  insert: (row: { event_id: string; type: string }) => Promise<{ error: { code?: string; message?: string } | null }>
  delete: () => { eq: (c: 'event_id', v: string) => Promise<{ error: { message?: string } | null }> }
}
function webhookEvents(): WebhookEventsTable {
  const db = createAdminClient() as unknown as { from: (t: 'email_webhook_events') => WebhookEventsTable }
  return db.from('email_webhook_events')
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  const id = req.headers.get('svix-id')
  const timestamp = req.headers.get('svix-timestamp')
  const signature = req.headers.get('svix-signature')
  const body = await req.text()

  if (!secret || !id || !timestamp || !signature || !verifyResendSignature(secret, id, timestamp, body, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  // Replay window: the signature covers the timestamp, so a captured signed request can be
  // replayed forever unless we also bound its age. Reject anything outside the 5-minute
  // tolerance (svix's own default). Checked AFTER the signature so we never trust an
  // unverified timestamp.
  if (!isFreshTimestamp(timestamp)) {
    return NextResponse.json({ error: 'stale timestamp' }, { status: 401 })
  }

  let event: {
    type?: string
    data?: {
      to?: string | string[]
      email_id?: string
      headers?: unknown
      tags?: unknown
    }
  }
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'bad body' }, { status: 400 })
  }

  const type = (event.type ?? '').replace(/^email\./, '') || 'unknown'

  // CLAIM the svix-id before any side effect (scan2 L2-05). 23505 = already processed: ack and do
  // nothing. Any other claim error: 500, so Resend redelivers once the ledger can be written. Nothing
  // to release on that path, no row was inserted. Values go in the structured argument, never the
  // format string, so a header can never forge a log line.
  const claim = await webhookEvents().insert({ event_id: id, type })
  if (claim.error) {
    if (claim.error.code === '23505') {
      return NextResponse.json({ ok: true, duplicate: true })
    }
    console.error('[resend-webhook] idempotency claim failed', { type, code: claim.error.code ?? 'n/a' })
    return NextResponse.json({ ok: false, error: 'claim failed' }, { status: 500 })
  }

  const to = Array.isArray(event.data?.to) ? event.data?.to[0] : event.data?.to
  // Email Studio stamps the campaign id on send (X-Campaign-Id header + campaign_id tag); Resend
  // echoes both back here. Read it so recordEmailEvent can attribute the event EXACTLY. Purely
  // additive: null (transactional mail / an untagged historical send) records exactly as before.
  const campaignId = extractCampaignId(event.data)

  // Unmappable event (no recipient): acknowledge with 200. Retrying won't add
  // the missing field, so a non-2xx would only make Resend redeliver forever.
  // Log it so silently-skipped events are still visible.
  if (!to) {
    console.warn('[resend-webhook] skipped event with no recipient')
    return NextResponse.json({ ok: true, skipped: 'no recipient' })
  }

  // Suppression is the delivery-integrity-critical step, so run it first and
  // independently from the analytics log: a failure to record an event must not
  // stop us from suppressing a bouncing/complaining address, and vice versa.
  // Any failure is logged and returns 503 so Resend redelivers (suppress() is
  // idempotent; a redelivered event row is acceptable). Without this, an
  // unhandled throw became an unlogged 500 and the integrity signal was lost.
  // 2026-09-05 (scan2 L2-05): "a redelivered event row is acceptable" is retired. A suppression
  // failure now 503s BEFORE the email_events append, with the claim released, so the redelivery
  // re-runs suppression and appends exactly one row.
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

  // Suppression failed: release the claim and 503 BEFORE anything is appended, so the redelivery
  // re-runs suppression and the email_events row is written exactly once, by the delivery that works.
  if (errors.length > 0) {
    console.error('[resend-webhook] processing failed', { type, errors })
    await releaseClaim(id)
    return NextResponse.json({ ok: false, error: 'processing failed' }, { status: 503 })
  }

  // The email_events append, LAST of the retry-able steps (scan2 L2-05). If it fails nothing was
  // written, so releasing the claim and asking for a redelivery is safe; if it succeeds nothing
  // below can turn into a retry.
  try {
    await recordEmailEvent({
      email: to,
      eventType: type,
      providerId: event.data?.email_id ?? null,
      payload: event as Record<string, unknown>,
      campaignId,
    })
  } catch (err) {
    console.error('[resend-webhook] recordEmailEvent failed', { type, error: err instanceof Error ? err.message : String(err) })
    await releaseClaim(id)
    return NextResponse.json({ ok: false, error: 'processing failed' }, { status: 503 })
  }

  // CRM TIMELINE (ADR-378): project opened / clicked / bounced / complained onto the unified
  // contact_interactions timeline, but ONLY when the Resend id belongs to a Space send AND the
  // recipient maps to a known owner + contact. A pure platform email records NOTHING (no
  // platform-owner sentinel). Purely additive + best-effort: it never touches suppression and is
  // NOT pushed to `errors`, so a timeline-write blip cannot force a webhook redelivery (which would
  // needlessly re-fire suppression). handleSpaceSendEngagement is itself fail-safe (never throws).
  if (mapResendEventToInteraction(type)) {
    try {
      await handleSpaceSendEngagement(event.data?.email_id ?? null, type as ResendTimelineEventType)
    } catch (err) {
      // Pass the error as a separate console argument (not concatenated into the message) so a
      // user-controlled value can never forge a log line (CodeQL log-injection).
      console.warn('[resend-webhook] timeline projection failed', err)
    }
  }

  return NextResponse.json({ ok: true })
}

/** Release a claimed svix-id so Resend's redelivery is processed rather than answered as a duplicate.
 *  Called only BEFORE the email_events append (or after an append that failed), so a re-run appends
 *  at most one row. Best-effort: if the release itself fails, the retry is acked as a duplicate and
 *  the loss is logged rather than silent. */
async function releaseClaim(eventId: string): Promise<void> {
  try {
    const { error } = await webhookEvents().delete().eq('event_id', eventId)
    if (error) console.error('[resend-webhook] claim release failed', { error: error.message ?? 'n/a' })
  } catch (err) {
    console.error('[resend-webhook] claim release threw', { error: err instanceof Error ? err.message : String(err) })
  }
}

/** A plain uuid shape check, so a malformed value can never poison a campaign's analytics. */
function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

/**
 * Pull the Email Studio campaign id out of a Resend webhook payload. We stamp it on send in TWO
 * places Resend echoes back, and read whichever is present (fail-soft, never throws):
 *   • headers  — an array of { name, value }; we look for `X-Campaign-Id`.
 *   • tags     — either an array of { name, value } or an object map; we look for `campaign_id`.
 * Returns a validated uuid or null. Additive: an event with neither yields null.
 */
function extractCampaignId(data: { headers?: unknown; tags?: unknown } | undefined): string | null {
  if (!data) return null

  const headers = data.headers
  if (Array.isArray(headers)) {
    for (const h of headers) {
      const name = (h as { name?: unknown })?.name
      if (typeof name === 'string' && name.toLowerCase() === 'x-campaign-id') {
        const value = (h as { value?: unknown })?.value
        if (isUuid(value)) return value
      }
    }
  }

  const tags = data.tags
  if (Array.isArray(tags)) {
    for (const t of tags) {
      if ((t as { name?: unknown })?.name === 'campaign_id') {
        const value = (t as { value?: unknown })?.value
        if (isUuid(value)) return value
      }
    }
  } else if (tags && typeof tags === 'object') {
    const value = (tags as Record<string, unknown>).campaign_id
    if (isUuid(value)) return value
  }

  return null
}
