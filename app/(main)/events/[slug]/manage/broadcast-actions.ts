'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { type ActionResult, ok, fail, isError } from '@/lib/action-result'
import { rateLimitOk } from '@/lib/rate-limit'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { sendEventUpdateEmail } from '@/lib/email'
import { composeEventDispatch } from '@/lib/events/dispatch'
import { listEventCrmMemberIds } from '@/lib/events/crm-roster'
import {
  loadEventCrmAccess,
  resolveReinviteTarget,
  eventCrmLockedError,
} from '@/lib/events/crm-access'
import { resolveEventBroadcastAudience } from '@/lib/events/broadcast-audience'
import { sendSpaceCampaignSystem } from '@/lib/spaces/email'
import { renderCampaignHtml } from '@/lib/spaces/campaigns'
import { sendBulkDm, resolveDmRecipients } from '@/lib/comms/bulk-dm'
import { recordContactInteraction } from '@/lib/crm/interactions'
import { resolveHostingSpaceIdFromRow } from '@/lib/events/host-space'
import type {
  BroadcastChannelKey,
  BroadcastChannelResult,
  BroadcastSendInput,
} from '@/components/comms/broadcast-types'

// MESSAGE EVERYONE — the event hub's broadcast action (ADR-827 ruling 3: the multi-channel
// composer, wired on the event surface; ADR-828: it lives on the Manage hub's Home tab).
// ONE action, per-channel fan-out over the EXISTING seams, never a parallel sender:
//
//   Email    — the CAMPAIGNS machinery (owner refinement): a `campaigns` row (topic 'events')
//              in the event's host Space lane, delivered by the space send seam on the
//              'event_host' consent lane (ADR-1040: attending is the affirmative act, so a
//              host reaching their own guest list clears the transactional bar, not the
//              marketing double opt-in) — kill-switch, daily cap, suppression + hard
//              unsubscribes + per-topic mutes, per-recipient unsubscribe, outreach_sends
//              ledger, all unchanged. A platform-hosted event
//              (no host Space) falls back to the Event Dispatch email lane
//              (sendEventUpdateEmail per guest, 'dispatches' email preference).
//   DM       — one spine conversation per recipient (kind 'crm', channel 'in_app',
//              scope event), the operator-DM lane ADR-827 ruling 4 ordered: fully logged,
//              visible in the member's own inbox. Policy parity with lib/messages/scoped-dm:
//              same leadership gate (event.editSettings, the page-gate audience), same
//              going/maybe audience leg, per-recipient block check, shared rate buckets.
//   Dispatch — the frozen composeEventDispatch data layer (ADR-255), so the update lands
//              on the event page AND in Sent Dispatches exactly like the page composer's.
//   Text     — no action: SMS is refuse-first until A2P is filed (ADR-256); the chip is
//              disabled UI only and a smuggled 'sms' key is refused honestly below.
//
// GATE: 'event.editSettings' (the Manage hub's gate), re-checked here (ADR-274 — never
// trust the client). The audience is re-resolved server-side from segment keys.
// LOGGING: every delivered touch is stamped scope_kind 'event' + scope_id through the
// scope-spine front doors (openOrGetConversation scopeKind/scopeId, appendConversationMessage
// mirror.scope, RecordInteractionInput.scope — ADR-831), dual-writing the legacy
// metadata convention. Copy is plain, no em dashes (docs/CONTENT-VOICE.md).

const MAX_SUBJECT = 200
const MAX_BODY = 5000

const CHANNEL_ORDER: readonly BroadcastChannelKey[] = ['email', 'dm', 'dispatch', 'sms']

interface ManagedEvent {
  id: string
  title: string
  slug: string
  hostSpaceId: string | null
}

/** Resolve the event by slug and require 'event.editSettings' (the hub's gate), mirroring
 *  manage/crm/actions.ts. The host Space resolution is the ticketing one (ADR-819):
 *  host_space_id, else the placement space. Returns null on any miss (fail-closed). */
async function resolveManagedEvent(slug: string): Promise<ManagedEvent | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('events')
    .select('id, title, slug, space_id, host_space_id')
    .eq('slug', slug)
    .maybeSingle()
  const ev = data as
    | { id: string; title: string; slug: string; space_id: string | null; host_space_id: string | null }
    | null
  if (!ev) return null
  const caps = await getEventCapabilities(ev.id)
  if (!caps.has('event.editSettings')) return null
  // Root EXCLUDED: null here means "platform-hosted", which routes the broadcast down the Event
  // Dispatch lane instead of a Space's own email. The root stamp made every personal event claim
  // the platform tenant's lane.
  return { id: ev.id, title: ev.title, slug: ev.slug, hostSpaceId: await resolveHostingSpaceIdFromRow(ev) }
}

function people(n: number): string {
  return `${n} ${n === 1 ? 'person' : 'people'}`
}

// ── Email: the campaigns lane (host Space) or the event update lane (platform) ─────────

/** Untyped `campaigns` handle (space_id/topic reached past the generated types, ADR-246 —
 *  the same convention lib/spaces/campaigns.ts uses). */
function campaignsTable() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as unknown as { from: (t: string) => any }
  return db.from('campaigns')
}

async function sendEmailChannel(args: {
  event: ManagedEvent
  actorId: string
  subject: string
  body: string
  segments: string[]
  audience: string[]
  recipients: Map<string, { displayName: string; email: string | null }>
}): Promise<BroadcastChannelResult> {
  const { event, actorId, subject, body } = args
  if (!subject) return { channel: 'email', ok: false, detail: 'Add a subject to send email.' }

  const emailable = args.audience
    .map((id) => ({ profileId: id, ...args.recipients.get(id) }))
    .filter((r): r is { profileId: string; displayName: string; email: string } => !!r.email)
  if (emailable.length === 0) {
    return { channel: 'email', ok: false, detail: 'No one in this audience has an email address on file.' }
  }

  // ── Host-Space lane: the REAL campaigns machinery (owner refinement). ──────────────────
  if (event.hostSpaceId) {
    const spaceId = event.hostSpaceId

    // 1. The campaigns row, topic 'events' (per-topic mutes key off it), in the host
    //    Space's lane, so the send shows up wherever campaigns are tracked. The gate here
    //    is the EVENT's (event.editSettings): a cohost may not hold a Space role, so this
    //    writes the row directly (the same insert createSpaceCampaign performs) and the
    //    delivery core below still re-runs every anti-spam gate.
    let campaignId: string | null = null
    try {
      const { data } = await campaignsTable()
        .insert([
          {
            space_id: spaceId,
            subject,
            body,
            status: 'draft',
            created_by: actorId,
            topic: 'events',
            audience_filter: { source: 'event_broadcast', event_id: event.id, segments: args.segments },
          },
        ])
        .select('id')
        .maybeSingle()
      campaignId = (data as { id: string } | null)?.id ?? null
    } catch {
      campaignId = null
    }
    if (!campaignId) {
      return { channel: 'email', ok: false, detail: 'Could not create the campaign. Try again.' }
    }

    // 2. Map recipients to the Space's contacts where they exist (ledger + engagement
    //    attribution), then hand the batch to the shared delivery core. The SYSTEM entry is
    //    used because the caller is authorized by the EVENT gate above, not a Space role;
    //    the core still enforces the plan gate, kill-switch, daily cap, consent + topic
    //    mutes, suppression, and the per-recipient unsubscribe.
    const contactIdByEmail = new Map<string, string>()
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = createAdminClient() as unknown as { from: (t: string) => any }
      const { data } = await db
        .from('contacts')
        .select('id, email')
        .eq('space_id', spaceId)
        .in('email', emailable.map((r) => r.email))
      for (const c of (data ?? []) as { id: string; email: string | null }[]) {
        if (c.email) contactIdByEmail.set(c.email.toLowerCase(), c.id)
      }
    } catch {
      // contact mapping is best-effort; the send still goes by address.
    }

    const res = await sendSpaceCampaignSystem(spaceId, {
      campaignId,
      subject,
      html: renderCampaignHtml(body),
      topic: 'events',
      // The event-host consent lane (ADR-1040): attending is the affirmative act, so this send
      // clears at the transactional bar instead of the marketing double opt-in. Under the blanket
      // marketing rule an RSVP list was structurally unreachable (an RSVP creates no subscribed
      // contact, so every recipient logged 'suppressed'). Suppression, a hard unsubscribe, the
      // per-topic 'events' mute, the kill switch, the daily cap and the plan allowance all still
      // apply, and every send still carries a one-click unsubscribe.
      lane: 'event_host',
      recipients: emailable.map((r) => ({ email: r.email, contactId: contactIdByEmail.get(r.email) })),
    })
    if (isError(res)) return { channel: 'email', ok: false, detail: res.error }

    // 3. Stamp the campaign sent (best-effort, mirroring lib/spaces/campaigns.ts).
    try {
      await campaignsTable()
        .update({ status: 'sent', sent_at: new Date().toISOString(), recipient_count: res.data.sent })
        .eq('id', campaignId)
        .eq('space_id', spaceId)
    } catch {
      // the emails already went; the stamp is non-critical.
    }

    // 4. Scope-spine logging (ADR-831): one event-scoped timeline touch per recipient the
    //    ledger confirms as sent. The seam already logged the campaign-scoped CONTACT touch;
    //    this is the event lane's PROFILE touch, so Message Attendees' The Path shows the
    //    send. Exactly-once per (campaign, profile). Best-effort, never blocks the result.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = createAdminClient() as unknown as { from: (t: string) => any }
      const { data } = await db
        .from('outreach_sends')
        .select('email')
        .eq('campaign_id', campaignId)
        .eq('status', 'sent')
      const sentEmails = new Set(
        ((data ?? []) as { email: string | null }[]).map((r) => r.email?.toLowerCase()).filter(Boolean),
      )
      for (const r of emailable) {
        if (!sentEmails.has(r.email)) continue
        await recordContactInteraction(
          {
            ownerProfileId: actorId,
            subjectKind: 'profile',
            subjectId: r.profileId,
            channel: 'email',
            direction: 'outbound',
            summary: subject,
            body,
            source: 'crm_activity',
            scope: { kind: 'event', id: event.id },
            metadata: { kind: 'event_broadcast', event_id: event.id, campaign_id: campaignId },
            idempotencyKey: `event-broadcast:${campaignId}:${r.profileId}`,
          },
          spaceId,
        )
      }
    } catch {
      // timeline mirroring is best-effort.
    }

    const { sent, suppressed, failed } = res.data
    let detail = `Sent to ${people(sent)} through the host Space's campaign lane.`
    if (suppressed > 0) detail += ` ${suppressed} skipped (unsubscribed, or muted event emails).`
    if (failed > 0) detail += ` ${failed} failed.`
    return { channel: 'email', ok: sent > 0 || (suppressed === 0 && failed === 0), detail }
  }

  // ── Platform-hosted (no host Space): the Event Dispatch email lane. ─────────────────────
  // Same behavior as "Email guests" on an Event Dispatch (lib/events/dispatch.ts): the
  // branded event update template, each guest gated by their 'dispatches' email preference
  // and the outbox suppression guard. KNOWN LIMITATION: no campaigns row and no per-topic
  // contact mutes on this lane (there is no Space lane to hang them on).
  const broadcastRef = randomUUID()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
  const eventUrl = `${appUrl}/events/${event.slug}`
  let sent = 0
  let skipped = 0
  for (const r of emailable) {
    try {
      // The ONE seam (ADR-169), not the bare preference read it replaced, which skipped
      // suppression (meta-scan B9 H6). No subject: this lane exists only when there is no host
      // Space, and the row read above carries no Circle scope to name.
      if (!(await resolveSendGate(r.profileId, 'email', 'dispatches', { email: r.email })).allowed) {
        skipped++
        continue
      }
      await sendEventUpdateEmail({
        to: r.email,
        recipientName: r.displayName,
        recipientProfileId: r.profileId,
        eventTitle: event.title,
        updateTitle: subject,
        body,
        eventUrl,
      })
      sent++
      await recordContactInteraction(
        {
          ownerProfileId: actorId,
          subjectKind: 'profile',
          subjectId: r.profileId,
          channel: 'email',
          direction: 'outbound',
          summary: subject,
          body,
          source: 'crm_activity',
          scope: { kind: 'event', id: event.id },
          metadata: { kind: 'event_broadcast', event_id: event.id, broadcast_ref: broadcastRef },
          idempotencyKey: `event-broadcast:${broadcastRef}:${r.profileId}`,
        },
        null,
      )
    } catch {
      skipped++
    }
  }
  let detail = `Sent to ${people(sent)} as an event update email.`
  if (skipped > 0) detail += ` ${skipped} skipped (event emails off, or no deliverable address).`
  return { channel: 'email', ok: sent > 0, detail }
}

// ── Direct Message: the operator-DM spine lane (ADR-827 ruling 4) ───────────────────────

async function sendDmChannel(args: {
  event: ManagedEvent
  actorId: string
  subject: string
  body: string
  audience: string[]
  recipients: Map<string, { displayName: string; email: string | null }>
  /** The thread/touch metadata convention. Defaults to the broadcast stamp; the re-invite
   *  path passes kind 'event_reinvite' plus the target event id (ADR-836). The SCOPE stays
   *  the ORIGINAL event either way, so The Path shows the send in this event's lane. */
  metadata?: Record<string, unknown>
}): Promise<BroadcastChannelResult> {
  const { event, actorId, body } = args
  const metadata = args.metadata ?? { kind: 'event_broadcast', event_id: event.id }

  // Audience leg, policy parity with lib/messages/scoped-dm canDmEventAttendee: the DM lane
  // reaches the Message Attendees audience ONLY (going or maybe, the owner ruling). A picked
  // segment member outside it (a ticket holder who never answered) is skipped, counted.
  const attendeeSet = await listEventCrmMemberIds(event.id)
  const eligible = args.audience.filter((id) => id !== actorId && attendeeSet.has(id))
  const outsideAudience = args.audience.filter((id) => id !== actorId).length - eligible.length

  if (eligible.length === 0) {
    return { channel: 'dm', ok: false, detail: 'No one in this audience can receive a Direct Message (it reaches people going or maybe).' }
  }

  // The shared bulk-DM loop (lib/comms/bulk-dm): cap refuse-first, the shared abuse buckets, the
  // per-recipient block check, the email-keyed thread open + append, and the skip counting — one
  // implementation across the broadcast lanes.
  const res = await sendBulkDm({
    actorId,
    recipientProfileIds: eligible,
    subject: args.subject || event.title,
    body,
    spaceId: event.hostSpaceId,
    scope: { kind: 'event', id: event.id },
    bucket: 'event-broadcast',
    metadata,
    recipients: args.recipients,
    scopeOnMirror: true,
    presetSkipped: outsideAudience,
    skippedReason: 'not going or maybe, blocked, or unreachable',
    capAlternative: 'Use Email or a Dispatch for a list this size.',
  })
  return { channel: 'dm', ok: res.sent > 0, detail: res.detail }
}

// ── The action ──────────────────────────────────────────────────────────────────────────

/**
 * Send one composed message to the event's audience over the selected channels. Gate:
 * 'event.editSettings', re-checked here. The audience is re-resolved server-side from the
 * segment keys (never client ids). Returns one result per attempted channel; a short
 * channel never aborts the others.
 */
export async function sendEventBroadcast(
  slug: string,
  input: BroadcastSendInput,
): Promise<ActionResult<{ results: BroadcastChannelResult[] }>> {
  const actorId = await getMyProfileId()
  if (!actorId) return fail('Sign in to message your guests.')

  const event = await resolveManagedEvent(slug)
  if (!event) return fail('You cannot manage this event.')

  // The access-tier seam (ADR-836): once a personally-hosted event ends, a personal-tier
  // viewer's free-form sends lock on EVERY channel (email/dm/dispatch/sms). The one action
  // left is the re-invite path (sendEventReinvite below). Business/staff never lock.
  const access = await loadEventCrmAccess(event.id)
  if (!access.canMessage) return fail(eventCrmLockedError())

  const subject = (input.subject ?? '').trim().slice(0, MAX_SUBJECT)
  const body = (input.body ?? '').trim().slice(0, MAX_BODY)
  if (!body) return fail('Write something to send first.')

  const channels = CHANNEL_ORDER.filter((c) => Array.isArray(input.channels) && input.channels.includes(c))
  if (channels.length === 0) return fail('Pick at least one channel.')

  // One blast bucket across all channels (fail-closed in production when unconfigured).
  if (!(await rateLimitOk('event-broadcast:send', actorId, 10, '1 h'))) {
    return fail('You have sent a lot of broadcasts recently. Try again in a bit.')
  }

  const segments = Array.isArray(input.segments)
    ? input.segments.filter((s): s is string => typeof s === 'string')
    : []
  const audience = await resolveEventBroadcastAudience(event.id, segments)
  if (audience.length === 0) return fail('No one is in that audience yet.')

  // Emails + names are needed by both the email lane and the DM thread keys.
  const needsRecipients = channels.includes('email') || channels.includes('dm')
  const recipients = needsRecipients ? await resolveDmRecipients(audience) : new Map<string, { displayName: string; email: string | null }>()

  const results: BroadcastChannelResult[] = []
  let dispatched = false
  for (const channel of channels) {
    if (channel === 'email') {
      results.push(await sendEmailChannel({ event, actorId, subject, body, segments, audience, recipients }))
    } else if (channel === 'dm') {
      results.push(await sendDmChannel({ event, actorId, subject, body, audience, recipients }))
    } else if (channel === 'dispatch') {
      // The frozen Event Dispatch data layer (ADR-255): page post + Dispatch rail + push
      // fan-out to ITS audience (the whole event audience, not the picked segments), landing
      // in Sent Dispatches like every other Event Dispatch.
      try {
        const res = await composeEventDispatch({
          eventId: event.id,
          authorId: actorId,
          title: subject || null,
          body,
          toPage: true,
          toDispatch: true,
          eventUrl: `/events/${event.slug}`,
        })
        dispatched = !!(res.eventDispatchId || res.dispatchId)
        results.push(
          dispatched
            ? { channel: 'dispatch', ok: true, detail: 'Posted to the event page and sent as a Dispatch to the whole event audience.' }
            : { channel: 'dispatch', ok: false, detail: 'Could not post the Dispatch. Try again.' },
        )
      } catch {
        results.push({ channel: 'dispatch', ok: false, detail: 'Could not post the Dispatch. Try again.' })
      }
    } else {
      // 'sms': the chip is disabled UI; a hand-rolled request is refused honestly (ADR-256).
      results.push({ channel: 'sms', ok: false, detail: 'Text messages are coming soon.' })
    }
  }

  revalidatePath(`/events/${event.slug}/manage`)
  if (dispatched) revalidatePath(`/events/${event.slug}`)
  return ok({ results })
}

// ── RE-INVITE (ADR-836): the one post-lock action for a personal-tier viewer ─────────────

/** The wall-clock date of an event (starts_at stores wall-clock as UTC parts, so format in UTC;
 *  the same convention lib/events/follower-reminders documents). Empty on a missing date. */
function reinviteDateLabel(startsAt: string | null): string {
  if (!startsAt) return ''
  const t = Date.parse(startsAt)
  if (!Number.isFinite(t)) return ''
  return new Date(t).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
}

/**
 * Invite this event's attendee list to ANOTHER upcoming event the caller hosts or cohosts.
 * The v1 re-invite path (ADR-836): a server-authored event invite, never free text, delivered
 * through the EXISTING operator-DM spine lane (sendDmChannel above, exactly the machinery the
 * broadcast's Direct Message channel uses). Available to every tier that can open the surface;
 * for a locked personal-tier viewer it is the ONLY send left.
 *
 * GATE: 'event.editSettings' (resolveManagedEvent) + canReinvite from the access seam; the
 * TARGET is re-validated server-side (resolveReinviteTarget: published, upcoming, not
 * cancelled, hosted/cohosted by the caller), never trusted from the picker.
 * LOGGING: the scope spine stamps the ORIGINAL event (scope_kind 'event' + this event's id),
 * with metadata kind 'event_reinvite' + reinvite_event_id naming the target, so Message
 * Attendees' The Path shows the send in this event's lane.
 */
export async function sendEventReinvite(
  slug: string,
  targetEventId: string,
): Promise<ActionResult<{ results: BroadcastChannelResult[] }>> {
  const actorId = await getMyProfileId()
  if (!actorId) return fail('Sign in to invite your guests.')

  const event = await resolveManagedEvent(slug)
  if (!event) return fail('You cannot manage this event.')

  const access = await loadEventCrmAccess(event.id)
  if (!access.canReinvite) return fail('You cannot message this list.')

  const target = await resolveReinviteTarget(actorId, typeof targetEventId === 'string' ? targetEventId : '')
  if (!target || target.id === event.id) {
    return fail('Pick an upcoming event you host or cohost.')
  }

  // The same blast bucket as the broadcast action, so a locked list cannot become a loop.
  if (!(await rateLimitOk('event-broadcast:send', actorId, 10, '1 h'))) {
    return fail('You have sent a lot of broadcasts recently. Try again in a bit.')
  }

  // The list = the Message Attendees roster (going/maybe, the owner ruling), re-resolved
  // server-side. sendDmChannel re-intersects with the same set, so nothing widens it.
  const audience = [...(await listEventCrmMemberIds(event.id))]
  if (audience.length === 0) return fail('No one is on this list yet.')

  const admin = createAdminClient()
  const { data: actorRow } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', actorId)
    .maybeSingle()
  const actorName = (actorRow as { display_name: string | null } | null)?.display_name ?? 'Your host'

  // Server-authored invite copy (no free-text outreach on this path). Plain voice, no em dashes.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
  const when = reinviteDateLabel(target.startsAt)
  const subject = `You're invited: ${target.title}`.slice(0, MAX_SUBJECT)
  const body = [
    `${actorName} is inviting everyone from ${event.title} to their next event: ${target.title}${when ? ` on ${when}` : ''}.`,
    `See the details and RSVP here: ${appUrl}/events/${target.slug}`,
  ]
    .join('\n\n')
    .slice(0, MAX_BODY)

  const recipients = await resolveDmRecipients(audience)
  const result = await sendDmChannel({
    event,
    actorId,
    subject,
    body,
    audience,
    recipients,
    metadata: { kind: 'event_reinvite', event_id: event.id, reinvite_event_id: target.id },
  })

  revalidatePath(`/events/${event.slug}/manage`)
  return ok({ results: [result] })
}
