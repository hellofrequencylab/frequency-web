'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { isEventCohost } from '@/lib/events/cohosts'
import { viewerActsAsEventHost } from '@/lib/events/host-gate'
import { loadEventCrmAccess, eventCrmLockedError } from '@/lib/events/crm-access'
import {
  setRsvp,
  approveRsvp,
  type RsvpStatus,
} from '@/lib/events/rsvp-depth'
import { composeEventDispatch } from '@/lib/events/dispatch'
import { findOrCreateDirectConversation } from '@/lib/messages/direct-conversation'
import { isBlockedBetween } from '@/lib/blocking'
import { rateLimitOk } from '@/lib/rate-limit'

// Post-event social loop (slice B-2): the event activity feed (event_posts), the
// recap album (event_media), and cohosts (event_cohosts).
//
// The admin client bypasses RLS, so every action re-checks authorization here
// server-side (same posture as app/(main)/feed/actions.ts). event_posts,
// event_media, and event_cohosts are in lib/database.types.ts now, so the admin
// client is used directly and these reads/writes are fully typed.

const MAX_BODY = 2000
const MAX_CAPTION = 280
const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB

// Is this profile the host or a guest (any RSVP intent) of the event? Gates who
// may post a comment or add a recap photo. Cohosts count as guests too.
async function isOnEvent(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  profileId: string,
): Promise<boolean> {
  const { data: ev } = await admin
    .from('events')
    .select('host_id')
    .eq('id', eventId)
    .maybeSingle()
  if (!ev) return false
  if (ev.host_id === profileId) return true

  if (await isEventCohost(eventId, profileId)) return true

  const { data: rsvp } = await admin
    .from('event_rsvps')
    .select('status')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .maybeSingle()
  return !!rsvp && ['going', 'maybe', 'waitlist'].includes(rsvp.status ?? '')
}

// True when the caller holds the event HOST's authority: the host themself, or platform
// staff (web_role admin/janitor). One shared seam (lib/events/host-gate, ADR-841) so every
// host-only action below — cohost management, transfer, moderation, dispatch — admits an
// operator too. Before this, a seeded listing with host_id = the staff poster (or NULL)
// locked even a platform admin out of its own settings rail.
async function isEventHost(eventId: string, profileId: string): Promise<boolean> {
  return viewerActsAsEventHost(eventId, profileId)
}

function revalidateEvent(slug: string) {
  revalidatePath(`/events/${slug}`)
}

// ── Message the host ──────────────────────────────────────────────────────────
// Powers the event Host profile box (the `event-lineup` module, repurposed): a guest writes the
// host a direct message from the event page. Reuses the shared 1:1 conversation seam
// (findOrCreateDirectConversation) + the messages table — the SAME messaging backend as /messages —
// so the note lands in a real conversation the host reads there. Deliberately does NOT gate on
// friendship (a visitor should be able to reach the host of an event they're eyeing), matching the
// marketplace service-enquiry entry point; the block gate + a rate limit stand in for that.
const MAX_HOST_MESSAGE = 2000

export async function messageHost(
  eventId: string,
  body: string,
): Promise<ActionResult<{ conversationId: string }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to message the host.')

  const trimmed = (body ?? '').trim().slice(0, MAX_HOST_MESSAGE)
  if (!trimmed) return fail('Write a message first.')

  const admin = createAdminClient()
  const { data: ev } = await admin
    .from('events')
    .select('host_id')
    .eq('id', eventId)
    .maybeSingle()
  const hostId = ev?.host_id ?? null
  if (!hostId) return fail('This event has no host to reach right now.')
  if (hostId === profileId) return fail('You are hosting this event.')

  // Block gate (parity with startConversation / sendMessage).
  if (await isBlockedBetween(profileId, hostId)) {
    return fail('You cannot message this host.')
  }

  // Spam guard: this bypasses the friendship gate, so cap notes per sender.
  if (!(await rateLimitOk('event_message_host', profileId, 5, '1 h'))) {
    return fail('You have sent a lot of messages. Try again in a little while.')
  }

  const conversationId = await findOrCreateDirectConversation(admin, profileId, hostId)
  const { error } = await admin.from('messages').insert({
    conversation_id: conversationId,
    sender_id: profileId,
    body: trimmed,
  })
  if (error) return fail('Could not send your message. Try again.')

  revalidatePath('/messages')
  revalidatePath(`/messages/${conversationId}`)
  return ok({ conversationId })
}

// ── Activity feed ─────────────────────────────────────────────────────────────

export async function createEventPost(
  eventId: string,
  slug: string,
  body: string,
  imageUrl: string | null,
): Promise<ActionResult<void>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to comment.')

  const trimmed = (body ?? '').trim().slice(0, MAX_BODY)
  const image = imageUrl?.trim() || null
  if (!trimmed && !image) return fail('Add a message or a photo first.')

  const admin = createAdminClient()
  // ANY signed-in member may comment on an event they can see (the RSVP/guest
  // requirement was dropped so the wall reads as open conversation — recap photos
  // below still require being on the event). The event just has to exist.
  const { data: ev } = await admin.from('events').select('id').eq('id', eventId).maybeSingle()
  if (!ev) return fail('This event no longer exists.')

  const { error } = await admin
    .from('event_posts')
    .insert({
      event_id: eventId,
      profile_id: profileId,
      body: trimmed,
      image_url: image,
    })
  if (error) {
    console.error('[createEventPost]', error.message)
    return fail('Could not post your comment. Please try again.')
  }

  revalidateEvent(slug)
  return ok()
}

export async function deleteEventPost(postId: string, slug: string) {
  const profileId = await getMyProfileId()
  if (!profileId) return

  const admin = createAdminClient()

  const { data: post } = await admin
    .from('event_posts')
    .select('id, event_id, profile_id')
    .eq('id', postId)
    .maybeSingle()
  if (!post) return

  // The author may remove their own comment; the event host moderates their page.
  const canDelete =
    post.profile_id === profileId || (await isEventHost(post.event_id, profileId))
  if (!canDelete) return

  await admin.from('event_posts').delete().eq('id', postId)
  revalidateEvent(slug)
}

// ── Recap album ───────────────────────────────────────────────────────────────

export async function uploadEventMedia(
  eventId: string,
  slug: string,
  formData: FormData,
): Promise<ActionResult<void>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to add a photo.')

  const file = formData.get('image')
  const caption = formData.get('caption')
  if (!(file instanceof File) || file.size === 0) return fail('Pick a photo first.')
  if (file.size > MAX_IMAGE_BYTES) return fail('Keep the photo under 10 MB.')
  if (!file.type.startsWith('image/')) return fail('Only image files work here.')
  const cap = (typeof caption === 'string' ? caption.trim() : '').slice(0, MAX_CAPTION) || null

  const admin = createAdminClient()
  if (!(await isOnEvent(admin, eventId, profileId))) return fail('Only the host and guests can add photos.')

  // Upload server-side with the service-role client. The browser upload failed RLS
  // because the event-media INSERT policy requires the object path to be prefixed with
  // the caller's auth uid, and the SSR browser client did not carry that session — so it
  // went out as `anon` and was denied. The admin client side-steps the trap; isOnEvent
  // above is the real authorization gate (host or guest only).
  const safeName = (file.name || 'photo').replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${profileId}/${eventId}/${Date.now()}-${safeName}`
  const { error: upErr } = await admin.storage
    .from('event-media')
    .upload(path, file, { contentType: file.type, upsert: false })
  if (upErr) {
    console.error('[uploadEventMedia upload]', upErr.message)
    return fail('Could not upload your photo. Please try again.')
  }
  const {
    data: { publicUrl },
  } = admin.storage.from('event-media').getPublicUrl(path)

  const { error } = await admin
    .from('event_media')
    .insert({
      event_id: eventId,
      profile_id: profileId,
      image_url: publicUrl,
      caption: cap,
    })
  if (error) {
    console.error('[uploadEventMedia]', error.message)
    return fail('Could not add your photo. Please try again.')
  }

  revalidateEvent(slug)
  return ok()
}

export async function deleteEventMedia(mediaId: string, slug: string) {
  const profileId = await getMyProfileId()
  if (!profileId) return

  const admin = createAdminClient()

  const { data: media } = await admin
    .from('event_media')
    .select('id, event_id, profile_id')
    .eq('id', mediaId)
    .maybeSingle()
  if (!media) return

  const canDelete =
    media.profile_id === profileId || (await isEventHost(media.event_id, profileId))
  if (!canDelete) return

  await admin.from('event_media').delete().eq('id', mediaId)
  revalidateEvent(slug)
}

// ── Cohosts (invite / accept lifecycle) ────────────────────────────────────────
// The host INVITES a member to cohost (status 'invited'); the invitee accepts or
// declines. Only an ACCEPTED cohost is displayed publicly and counts for the
// host-capability checks. `removeCohost` deletes the row either way (a host
// cancelling a pending invite, or removing a real cohost).

export async function inviteCohost(
  eventId: string,
  slug: string,
  handle: string,
): Promise<ActionResult<void>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to manage cohosts.')

  const cleaned = handle.trim().replace(/^@/, '').toLowerCase()
  if (!cleaned) return fail('Enter a name or @handle.')

  const admin = createAdminClient()
  if (!(await isEventHost(eventId, profileId))) {
    return fail('Only the host can invite cohosts.')
  }

  // Resolve the handle to a real profile. A cohost must exist and not be the host.
  const { data: target } = await admin
    .from('profiles')
    .select('id')
    .eq('handle', cleaned)
    .maybeSingle()
  if (!target) return fail('We could not find that member.')
  if (target.id === profileId) return fail('You are already the host.')

  // A profile is a cohost of an event at most once (unique event_id, profile_id).
  // Look up any existing row so a re-invite after a decline works, and an already-
  // accepted cohost is a no-op the host reads as success.
  const { data: existing } = await admin
    .from('event_cohosts')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('profile_id', target.id)
    .maybeSingle()

  const nowIso = new Date().toISOString()

  if (existing?.status === 'accepted') {
    // Already a live cohost — nothing to send.
    revalidateEvent(slug)
    return ok()
  }

  if (existing) {
    // A prior 'invited' (re-send) or 'declined' (re-invite) row: reset it to a
    // fresh pending invite rather than tripping the unique constraint.
    const { error: upErr } = await admin
      .from('event_cohosts')
      .update({ status: 'invited', invited_at: nowIso, responded_at: null, added_by: profileId })
      .eq('id', existing.id)
    if (upErr) {
      console.error('[inviteCohost update]', upErr.message)
      return fail('We could not send that invite. Please try again.')
    }
  } else {
    const { error } = await admin
      .from('event_cohosts')
      .insert({
        event_id: eventId,
        profile_id: target.id,
        added_by: profileId,
        status: 'invited',
        invited_at: nowIso,
      })
    if (error) {
      console.error('[inviteCohost insert]', error.message)
      return fail('We could not send that invite. Please try again.')
    }
  }

  // Tell the invitee. Best-effort: a notification failure never blocks the invite.
  // The bell prefixes the actor's (host's) name, so `body` is the predicate.
  try {
    const { data: ev } = await admin.from('events').select('title').eq('id', eventId).maybeSingle()
    const title = ev?.title ?? 'an event'
    await admin.from('notifications').insert({
      recipient_id: target.id,
      actor_id: profileId,
      type: 'cohost_invite',
      reference_type: 'event',
      reference_id: eventId,
      body: `invited you to cohost "${title}"`,
    })
  } catch {
    /* best-effort */
  }

  revalidateEvent(slug)
  return ok()
}

// The invitee accepts their own pending invite: they become a real cohost and the
// host is notified. Invitee-only — the row's profile_id must equal the caller.
export async function acceptCohostInvite(
  eventId: string,
  slug: string,
): Promise<ActionResult<void>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to respond to this invite.')

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('event_cohosts')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .maybeSingle()
  if (!row || row.status === 'declined') return fail('This invite is no longer open.')
  if (row.status === 'accepted') {
    // Already accepted — idempotent success.
    revalidateEvent(slug)
    return ok()
  }

  const { error } = await admin
    .from('event_cohosts')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', row.id)
  if (error) {
    console.error('[acceptCohostInvite]', error.message)
    return fail('Could not accept the invite. Please try again.')
  }

  // Notify the host that their invite was accepted. Best-effort.
  try {
    const { data: ev } = await admin
      .from('events')
      .select('host_id, title')
      .eq('id', eventId)
      .maybeSingle()
    if (ev?.host_id) {
      await admin.from('notifications').insert({
        recipient_id: ev.host_id,
        actor_id: profileId,
        type: 'cohost_accepted',
        reference_type: 'event',
        reference_id: eventId,
        body: `accepted your invite to cohost "${ev.title}"`,
      })
    }
  } catch {
    /* best-effort */
  }

  revalidateEvent(slug)
  return ok()
}

// The invitee declines their own pending invite: the row is marked 'declined' and
// stays out of every list. Invitee-only. Declining an already-accepted seat is not
// allowed here (that is a host removal via removeCohost).
export async function declineCohostInvite(
  eventId: string,
  slug: string,
): Promise<ActionResult<void>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to respond to this invite.')

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('event_cohosts')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .maybeSingle()
  if (!row) return ok() // Nothing pending — nothing to decline.
  if (row.status === 'accepted') return fail('You are already a cohost of this event.')

  const { error } = await admin
    .from('event_cohosts')
    .update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('id', row.id)
  if (error) {
    console.error('[declineCohostInvite]', error.message)
    return fail('Could not decline the invite. Please try again.')
  }

  revalidateEvent(slug)
  return ok()
}

/** One row of the editor rail's cohost list (relation A, ADR-834): who the host has added or
 *  invited, so they can also REMOVE them from the same place they add them. */
export interface EditorCohostRow {
  profileId: string
  handle: string | null
  displayName: string
  avatarUrl: string | null
  status: 'invited' | 'accepted'
}

/** The current cohosts + pending invites for the editor rail (declined rows stay hidden; a
 *  re-invite resurrects them through inviteCohost). Host-gated like every cohost write; anyone
 *  else gets an empty list, and removeCohost re-checks the gate on the actual delete. */
export async function listEventCohostsForEditor(eventId: string): Promise<EditorCohostRow[]> {
  const profileId = await getMyProfileId()
  if (!profileId) return []

  const admin = createAdminClient()
  if (!(await isEventHost(eventId, profileId))) return []

  const { data: rows } = await admin
    .from('event_cohosts')
    .select('profile_id, status')
    .eq('event_id', eventId)
    .in('status', ['invited', 'accepted'])
    .order('invited_at', { ascending: true })
  const list = (rows ?? []) as { profile_id: string; status: 'invited' | 'accepted' }[]
  if (list.length === 0) return []

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, handle, display_name, avatar_url')
    .in('id', list.map((r) => r.profile_id))
  const byId = new Map(
    ((profiles ?? []) as { id: string; handle: string | null; display_name: string | null; avatar_url: string | null }[]).map(
      (p) => [p.id, p],
    ),
  )

  return list.map((r) => {
    const p = byId.get(r.profile_id)
    return {
      profileId: r.profile_id,
      handle: p?.handle ?? null,
      displayName: p?.display_name || 'A member',
      avatarUrl: p?.avatar_url ?? null,
      status: r.status,
    }
  })
}

export async function removeCohost(eventId: string, slug: string, cohostProfileId: string) {
  const profileId = await getMyProfileId()
  if (!profileId) return

  const admin = createAdminClient()
  if (!(await isEventHost(eventId, profileId))) return

  await admin
    .from('event_cohosts')
    .delete()
    .eq('event_id', eventId)
    .eq('profile_id', cohostProfileId)

  revalidateEvent(slug)
}

// ── Transfer host ───────────────────────────────────────────────────────────────
// The current host (or platform staff, ADR-841 — seeded listings especially need an operator
// to hand an event to its real organizer) hands the event to another member. The OUTGOING
// host, when there is one, is kept on as a cohost so they retain co-management and are never
// locked out of their own event. A staff caller who was never the host does not gain a cohost
// seat from transferring.
export async function transferEventHost(
  eventId: string,
  slug: string,
  handle: string,
): Promise<ActionResult<void>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to transfer the host role.')

  const cleaned = handle.trim().replace(/^@/, '').toLowerCase()
  if (!cleaned) return fail('Enter a name or @handle.')

  const admin = createAdminClient()
  if (!(await isEventHost(eventId, profileId))) {
    return fail('Only the current host can transfer the host role.')
  }

  // The outgoing host (null on a hostless seeded listing) — read BEFORE the handover so
  // they can be kept on as a cohost afterwards.
  const { data: ev } = await admin
    .from('events')
    .select('host_id')
    .eq('id', eventId)
    .maybeSingle()
  if (!ev) return fail('This event no longer exists.')
  const outgoingHostId = ev.host_id ?? null

  const { data: target } = await admin
    .from('profiles')
    .select('id')
    .eq('handle', cleaned)
    .maybeSingle()
  if (!target) return fail('We could not find that member.')
  if (target.id === outgoingHostId) return fail('They are already the host.')

  // Hand over the host seat.
  const { error: upErr } = await admin
    .from('events')
    .update({ host_id: target.id })
    .eq('id', eventId)
  if (upErr) {
    console.error('[transferEventHost]', upErr.message)
    return fail('Could not transfer the host role. Please try again.')
  }

  // The new host no longer needs a cohost row; the OUTGOING host (when one existed and is
  // not the new host) gains one so they keep co-management. A 23505 (already a cohost) on
  // the insert is fine to ignore.
  await admin.from('event_cohosts').delete().eq('event_id', eventId).eq('profile_id', target.id)
  if (outgoingHostId && outgoingHostId !== target.id) {
    const { error: insErr } = await admin
      .from('event_cohosts')
      .insert({ event_id: eventId, profile_id: outgoingHostId, added_by: profileId })
    if (insErr && insErr.code !== '23505') {
      console.error('[transferEventHost cohost]', insErr.message)
    }
  }

  revalidateEvent(slug)
  return ok()
}

// ── RSVP depth (EVENTS-REWORK A1) ──────────────────────────────────────────────
// The Invite's Join column writes maybe / +1 names / approval / waitlist through
// the frozen rsvp-depth data layer. Self-authorized: every call only ever touches
// the caller's own RSVP row (the lib upserts on (event_id, profile_id)). The DB
// capacity trigger still has the final say on going vs waitlist, so we never
// pre-check capacity here. `approvalStatus` is set by the page: invited guests
// skip the queue ('approved'); approval-required events open at 'pending'.

const RSVP_DEPTH_STATUSES: RsvpStatus[] = ['going', 'not_going', 'maybe', 'waitlist']

export async function setEventRsvpDepth(
  eventId: string,
  slug: string,
  args: {
    status: RsvpStatus
    plusOneNames?: string[]
    declineReason?: string | null
    approvalStatus?: 'none' | 'pending' | 'approved'
  },
) {
  const profileId = await getMyProfileId()
  if (!profileId) return
  if (!RSVP_DEPTH_STATUSES.includes(args.status)) return

  // A guest sets only their own RSVP and may request 'pending' (on approval-required events)
  // or 'none'. 'approved' is host-only (approveEventRsvp); never trust the client with it or a
  // guest self-approves past the queue (ADR-274).
  const approvalStatus = args.approvalStatus === 'approved' ? 'pending' : args.approvalStatus

  await setRsvp({
    eventId,
    profileId,
    status: args.status,
    plusOneNames: args.plusOneNames,
    declineReason: args.declineReason,
    approvalStatus,
  })

  revalidateEvent(slug)
  revalidatePath('/events', 'layout')
}

// Host approves one pending RSVP (approval-required events). Host/cohost only.
export async function approveEventRsvp(eventId: string, slug: string, guestProfileId: string) {
  const profileId = await getMyProfileId()
  if (!profileId) return

  if (!(await isEventHost(eventId, profileId)) && !(await isEventCohost(eventId, profileId)))
    return

  await approveRsvp(eventId, guestProfileId)
  revalidateEvent(slug)
}

// ── Event Dispatch (ADR-255) ──────────────────────────────────────────────────
// A host's update about one event. The base action always posts to the event
// page; the host may also send it as a Dispatch (rides the existing rail with an
// event badge + push fan-out) and/or text the group (SMS, gated/unbuilt per
// ADR-256 — the data layer records the flag and sends nothing). Host/cohost only;
// the frozen composeEventDispatch data layer does the channel fan-out.
export async function postEventDispatch(
  eventId: string,
  slug: string,
  args: {
    title?: string | null
    body: string
    toDispatch?: boolean
    toSms?: boolean
    /** Email the guest list too (ADR-255 email channel; per-guest preference-gated). */
    toEmail?: boolean
  },
): Promise<ActionResult<void>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to post an update.')

  const isAuthor =
    (await isEventHost(eventId, profileId)) || (await isEventCohost(eventId, profileId))
  if (!isAuthor) return fail('Only the host or a cohost can post an update.')

  const body = (args.body ?? '').trim()
  if (!body) return fail('Write something to send first.')

  // The access-tier seam (ADR-836): once a personally-hosted event ends, the OUTREACH
  // channels (Dispatch rail + push, email, SMS) lock for a personal-tier author, or the
  // event page composer would bypass the Message Attendees lock. A plain page post stays
  // allowed in every state: it is content on the event page, not a send to the list.
  if (args.toDispatch || args.toSms || args.toEmail) {
    const access = await loadEventCrmAccess(eventId)
    if (!access.canMessage) return fail(eventCrmLockedError())
  }

  try {
    await composeEventDispatch({
      eventId,
      authorId: profileId,
      title: args.title?.trim() || null,
      body,
      toPage: true,
      toDispatch: !!args.toDispatch,
      toSms: !!args.toSms,
      toEmail: !!args.toEmail,
      eventUrl: `/events/${slug}`,
    })
  } catch (e) {
    console.error('[postEventDispatch]', e)
    return fail('Could not post your update. Please try again.')
  }

  revalidateEvent(slug)
  return ok()
}
