import { createAdminClient } from '@/lib/supabase/admin'
import { enqueue } from '@/lib/queue/outbox'
import type { PushPayload } from '@/lib/push'
import { resolveEventDispatchAudience } from '@/lib/events/dispatch-audience'
import { sendSms, isSmsProvisioned } from '@/lib/comms/sms'

// Event Dispatches data layer (ADR-255 / EVENTS-REWORK A2).
//
// A host update ALWAYS posts to the event page (the base action). Optional
// channels:
//   • to_dispatch — also create a `dispatches` row (rides the existing rail with
//                   an event badge) and enqueue in-app/push fan-out to the event
//                   audience via the durable notification_queue (lib/queue).
//   • to_sms      — "text the group" (ADR-255). When provisioned (the A2P legal track
//                   is live), each consented audience member is texted through sendSms,
//                   which enforces consent + SMS prefs + quiet hours per member. When
//                   NOT provisioned this no-ops (logs intent, sends nothing) — fully
//                   fail-closed (ADR-256).
//
// Reuses dispatches + notification_queue — NOT a new broadcaster. event_dispatches
// is in lib/database.types.ts now, so the admin client is used directly and fully
// typed. Authorize the caller as host/cohost before calling (RLS would also gate a
// client write, but this runs on the admin client).

export interface ComposeEventDispatchArgs {
  eventId: string
  /** The host/cohost composing (must be pre-authorized). */
  authorId: string
  title?: string | null
  body: string
  /** Channel toggles. to_page is the always-on base action and defaults true. */
  toPage?: boolean
  toDispatch?: boolean
  toSms?: boolean
  /** Where the in-app/push notification should land (the event page). */
  eventUrl?: string
}

export interface ComposeEventDispatchResult {
  /** The event_dispatches row id (the page update). */
  eventDispatchId: string | null
  /** The dispatches row id, when to_dispatch was on. */
  dispatchId: string | null
  /** How many push jobs were enqueued for the fan-out. */
  enqueued: number
  /** True when to_sms was requested. Unsent unless provisioned + per-member gates pass. */
  smsRequested: boolean
  /** How many audience members were texted (allowed by sendSms). 0 while gated. */
  smsSent: number
}

/**
 * Compose-once, fan-out-by-channel. Records the page update, optionally publishes
 * a Dispatch + enqueues push fan-out to the non-muted event audience, and no-ops
 * SMS. Best-effort on fan-out: a failed enqueue never undoes the page post.
 */
export async function composeEventDispatch(
  args: ComposeEventDispatchArgs,
): Promise<ComposeEventDispatchResult> {
  const admin = createAdminClient()
  const toPage = args.toPage ?? true
  const toDispatch = args.toDispatch ?? false
  const toSms = args.toSms ?? false
  const title = args.title?.trim() || null
  const body = args.body.trim()

  const result: ComposeEventDispatchResult = {
    eventDispatchId: null,
    dispatchId: null,
    enqueued: 0,
    smsRequested: toSms,
    smsSent: 0,
  }

  if (!body) return result

  // 1. Optionally publish a Dispatch on the existing rail. The audience is the
  //    event itself; we ride the 'global'-shaped insert minimally — scope is the
  //    event, so we record the link in event_dispatches and target recipients via
  //    the RSVP audience below (not via dispatches' circle/hub/nexus scoping). The
  //    `dispatch_type` carries the event badge the feed renders.
  let dispatchId: string | null = null
  if (toDispatch) {
    const { data: disp } = await admin
      .from('dispatches')
      .insert({
        author_id: args.authorId,
        title: title ?? 'Event update',
        body,
        // Event Dispatches reach the event audience (resolved below), not a
        // community tier; 'global' satisfies the audience_id-null constraint and
        // the app filters by the event link, not by dispatch scope.
        audience_scope: 'global',
        audience_id: null,
        dispatch_type: 'event',
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle()
    dispatchId = disp?.id ?? null
    result.dispatchId = dispatchId
  }

  // 2. Record the page update (the base action). Always written so the event page
  //    has the update timeline, even for a page-only update.
  if (toPage || !toDispatch) {
    const { data: ed } = await admin
      .from('event_dispatches')
      .insert({
        event_id: args.eventId,
        author_id: args.authorId,
        dispatch_id: dispatchId,
        title,
        body,
        to_page: toPage,
        to_dispatch: toDispatch,
        to_sms: toSms,
      })
      .select('id')
      .maybeSingle()
    result.eventDispatchId = ed?.id ?? null
  }

  // 3. Fan out push to the non-muted event audience when this rode the Dispatch
  //    rail. Page-only updates do not push (they're pull, shown on the page).
  if (toDispatch) {
    result.enqueued = await fanOutEventPush(args.eventId, {
      title: title ?? 'Event update',
      body,
      url: args.eventUrl ?? `/events`,
    })
  }

  // 4. "Text the group" (ADR-255). Recorded on the row above. When the legal track is
  //    live (provisioned), text each consented audience member; sendSms enforces consent
  //    + SMS prefs + quiet hours PER member, so this only resolves WHO. When NOT
  //    provisioned this is a no-op log — fully fail-closed (ADR-256).
  if (toSms) {
    if (!isSmsProvisioned()) {
      console.info(
        `[event-dispatch] to_sms requested for event ${args.eventId} — SMS is gated (ADR-256), not sent`,
      )
    } else {
      result.smsSent = await fanOutEventSms(args.eventId, title ?? 'Event update', body)
    }
  }

  return result
}

/**
 * Text the consented event audience for a "text the group" Event Dispatch. Resolves the
 * SAME audience as the push fan-out, then routes EACH member through sendSms, which runs
 * the full per-member gate (consent ledger -> SMS prefs -> quiet hours) and only sends to
 * those who pass. The member's home_timezone drives the quiet-hours check. Returns how
 * many were actually allowed + texted. Best-effort: a single failure never aborts the
 * batch. Carries sender identity + a STOP line, matching the A2P samples
 * (docs/A2P-REGISTRATION.md §4a #3).
 */
export async function fanOutEventSms(
  eventId: string,
  title: string,
  body: string,
): Promise<number> {
  const recipients = await resolveEventDispatchAudience(eventId)
  if (recipients.length === 0) return 0

  const admin = createAdminClient()
  // Pull home_timezone for the batch so the quiet-hours check is per-member-accurate.
  const tzByProfile = new Map<string, string | null>()
  try {
    const { data } = await admin
      .from('profiles')
      .select('id, home_timezone')
      .in('id', recipients)
    for (const p of (data ?? []) as { id: string; home_timezone: string | null }[]) {
      tzByProfile.set(p.id, p.home_timezone)
    }
  } catch {
    // tz lookup is best-effort; sendSms falls back to UTC when a tz is missing.
  }

  // "Frequency:" sender prefix + STOP opt-out in every text (carrier requirement + the
  // registered A2P samples). Title leads, then the body.
  const smsBody = `Frequency: ${title}. ${body} Reply STOP to opt out.`

  let sent = 0
  for (const profileId of recipients) {
    try {
      const decision = await sendSms({
        profileId,
        category: 'dispatches',
        body: smsBody,
        timeZone: tzByProfile.get(profileId) ?? null,
      })
      if (decision.allowed) sent++
    } catch {
      // skip a bad recipient; the rest of the fan-out still goes out
    }
  }
  return sent
}

/**
 * Enqueue a push job per member who should hear about this Event Dispatch.
 *
 * PUSH audience (ADR-255 owner rule, resolved by resolveEventDispatchAudience):
 *   • event guests — RSVP going/maybe/waitlist, muted=false (per-event mute honoured),
 *   • the hosting Circle's active members.
 * The "surrounding area" bleed is deliberately NOT pushed: it is a passive FEED
 * surface, gated on resonance (the owner's rule — "the feed of people close by who
 * have resonance"), handled in components/feed by viewerInEventDispatchArea. Pushing
 * unsolicited to nearby strangers would be spam; nearby resonant members discover it
 * in their feed instead.
 *
 * Deduplicated across both. Each member's notification prefs / quiet hours /
 * consent are applied downstream by the send-gate at drain time, so this only
 * resolves WHO, never WHETHER. Returns the number enqueued. Best-effort — a single
 * bad recipient never aborts the batch.
 */
export async function fanOutEventPush(
  eventId: string,
  payload: PushPayload,
): Promise<number> {
  const recipients = await resolveEventDispatchAudience(eventId)

  let enqueued = 0
  for (const profileId of recipients) {
    try {
      await enqueue('push', { profileId, payload, category: 'dispatches' })
      enqueued++
    } catch {
      // skip a bad recipient; the rest of the fan-out still goes out
    }
  }
  return enqueued
}
