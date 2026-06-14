import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueue } from '@/lib/queue/outbox'
import type { PushPayload } from '@/lib/push'
import { resolveEventDispatchAudience } from '@/lib/events/dispatch-audience'

// Event Dispatches data layer (ADR-255 / EVENTS-REWORK A2).
//
// A host update ALWAYS posts to the event page (the base action). Optional
// channels:
//   • to_dispatch — also create a `dispatches` row (rides the existing rail with
//                   an event badge) and enqueue in-app/push fan-out to the event
//                   audience via the durable notification_queue (lib/queue).
//   • to_sms      — recorded only; the SMS send is gated/unbuilt (ADR-256). This
//                   composer no-ops it (logs intent, sends nothing).
//
// Reuses dispatches + notification_queue — NOT a new broadcaster. event_dispatches
// is new (not in lib/database.types.ts) → untyped admin client; the `dispatches`
// insert is typed-shaped but routed through the same untyped client for one code
// path. Authorize the caller as host/cohost before calling (RLS would also gate a
// client write, but this runs on the admin client).

function untyped(): SupabaseClient {
  return createAdminClient()
}

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
  /** True when to_sms was requested; always unsent (gated — ADR-256). */
  smsRequested: boolean
}

/**
 * Compose-once, fan-out-by-channel. Records the page update, optionally publishes
 * a Dispatch + enqueues push fan-out to the non-muted event audience, and no-ops
 * SMS. Best-effort on fan-out: a failed enqueue never undoes the page post.
 */
export async function composeEventDispatch(
  args: ComposeEventDispatchArgs,
): Promise<ComposeEventDispatchResult> {
  const admin = untyped()
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
    dispatchId = (disp as { id: string } | null)?.id ?? null
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
    result.eventDispatchId = (ed as { id: string } | null)?.id ?? null
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

  // 4. SMS is gated/unbuilt (ADR-256). Recorded on the row above; nothing sent.
  if (toSms) {
    console.info(
      `[event-dispatch] to_sms requested for event ${args.eventId} — SMS is gated (ADR-256), not sent`,
    )
  }

  return result
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
