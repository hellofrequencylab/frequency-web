'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { isEventCohost } from '@/lib/events/cohosts'
import {
  setRsvp,
  approveRsvp,
  type RsvpStatus,
} from '@/lib/events/rsvp-depth'
import { composeEventDispatch } from '@/lib/events/dispatch'

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

// True when the caller is the event host (the only one who manages cohosts).
async function isEventHost(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  profileId: string,
): Promise<boolean> {
  const { data: ev } = await admin
    .from('events')
    .select('host_id')
    .eq('id', eventId)
    .maybeSingle()
  return !!ev && ev.host_id === profileId
}

function revalidateEvent(slug: string) {
  revalidatePath(`/events/${slug}`)
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
  if (!(await isOnEvent(admin, eventId, profileId))) return fail('Only the host and guests can post here.')

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
    post.profile_id === profileId || (await isEventHost(admin, post.event_id, profileId))
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
    media.profile_id === profileId || (await isEventHost(admin, media.event_id, profileId))
  if (!canDelete) return

  await admin.from('event_media').delete().eq('id', mediaId)
  revalidateEvent(slug)
}

// ── Cohosts ───────────────────────────────────────────────────────────────────

export async function addCohost(
  eventId: string,
  slug: string,
  handle: string,
): Promise<ActionResult<void>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to manage cohosts.')

  const cleaned = handle.trim().replace(/^@/, '').toLowerCase()
  if (!cleaned) return fail('Enter a name or @handle.')

  const admin = createAdminClient()
  if (!(await isEventHost(admin, eventId, profileId))) {
    return fail('Only the host can add cohosts.')
  }

  // Resolve the handle to a real profile. A cohost must exist and not be the host.
  const { data: target } = await admin
    .from('profiles')
    .select('id')
    .eq('handle', cleaned)
    .maybeSingle()
  if (!target) return fail('We could not find that member.')
  if (target.id === profileId) return fail('You are already the host.')

  // Unique (event_id, profile_id). A unique violation (Postgres 23505) means they are
  // already a cohost, which is a success from the caller's view; any OTHER error is a
  // real failure and must surface rather than be swallowed.
  const { error } = await admin
    .from('event_cohosts')
    .insert({
      event_id: eventId,
      profile_id: target.id,
      added_by: profileId,
    })
  if (error && error.code !== '23505') {
    console.error('[addCohost]', error.message)
    return fail('We could not add that cohost. Please try again.')
  }

  revalidateEvent(slug)
  return ok()
}

export async function removeCohost(eventId: string, slug: string, cohostProfileId: string) {
  const profileId = await getMyProfileId()
  if (!profileId) return

  const admin = createAdminClient()
  if (!(await isEventHost(admin, eventId, profileId))) return

  await admin
    .from('event_cohosts')
    .delete()
    .eq('event_id', eventId)
    .eq('profile_id', cohostProfileId)

  revalidateEvent(slug)
}

// ── Transfer host ───────────────────────────────────────────────────────────────
// The current host hands the event to another member. The outgoing host is kept on as
// a cohost so they retain co-management and are never locked out of their own event.
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
  if (!(await isEventHost(admin, eventId, profileId))) {
    return fail('Only the current host can transfer the host role.')
  }

  const { data: target } = await admin
    .from('profiles')
    .select('id')
    .eq('handle', cleaned)
    .maybeSingle()
  if (!target) return fail('We could not find that member.')
  if (target.id === profileId) return fail('You are already the host.')

  // Hand over the host seat.
  const { error: upErr } = await admin
    .from('events')
    .update({ host_id: target.id })
    .eq('id', eventId)
  if (upErr) {
    console.error('[transferEventHost]', upErr.message)
    return fail('Could not transfer the host role. Please try again.')
  }

  // The new host no longer needs a cohost row; the outgoing host gains one so they keep
  // co-management. A 23505 (already a cohost) on the insert is fine to ignore.
  await admin.from('event_cohosts').delete().eq('event_id', eventId).eq('profile_id', target.id)
  const { error: insErr } = await admin
    .from('event_cohosts')
    .insert({ event_id: eventId, profile_id: profileId, added_by: profileId })
  if (insErr && insErr.code !== '23505') {
    console.error('[transferEventHost cohost]', insErr.message)
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

  const admin = createAdminClient()
  if (!(await isEventHost(admin, eventId, profileId)) && !(await isEventCohost(eventId, profileId)))
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
  args: { title?: string | null; body: string; toDispatch?: boolean; toSms?: boolean },
): Promise<ActionResult<void>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to post an update.')

  const admin = createAdminClient()
  const isAuthor =
    (await isEventHost(admin, eventId, profileId)) || (await isEventCohost(eventId, profileId))
  if (!isAuthor) return fail('Only the host or a cohost can post an update.')

  const body = (args.body ?? '').trim()
  if (!body) return fail('Write something to send first.')

  try {
    await composeEventDispatch({
      eventId,
      authorId: profileId,
      title: args.title?.trim() || null,
      body,
      toPage: true,
      toDispatch: !!args.toDispatch,
      toSms: !!args.toSms,
      eventUrl: `/events/${slug}`,
    })
  } catch (e) {
    console.error('[postEventDispatch]', e)
    return fail('Could not post your update. Please try again.')
  }

  revalidateEvent(slug)
  return ok()
}
