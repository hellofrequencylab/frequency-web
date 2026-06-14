'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { isEventCohost } from '@/lib/events/cohosts'
import {
  setRsvp,
  approveRsvp,
  setRsvpMuted,
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
) {
  const profileId = await getMyProfileId()
  if (!profileId) return

  const trimmed = (body ?? '').trim().slice(0, MAX_BODY)
  const image = imageUrl?.trim() || null
  if (!trimmed && !image) return

  const admin = createAdminClient()
  if (!(await isOnEvent(admin, eventId, profileId))) return

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
    return
  }

  revalidateEvent(slug)
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
  imageUrl: string,
  caption: string | null,
) {
  const profileId = await getMyProfileId()
  if (!profileId) return

  const image = imageUrl?.trim()
  if (!image) return
  const cap = caption?.trim().slice(0, MAX_CAPTION) || null

  const admin = createAdminClient()
  if (!(await isOnEvent(admin, eventId, profileId))) return

  const { error } = await admin
    .from('event_media')
    .insert({
      event_id: eventId,
      profile_id: profileId,
      image_url: image,
      caption: cap,
    })
  if (error) {
    console.error('[uploadEventMedia]', error.message)
    return
  }

  revalidateEvent(slug)
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

export async function addCohost(eventId: string, slug: string, handle: string) {
  const profileId = await getMyProfileId()
  if (!profileId) return

  const cleaned = handle.trim().replace(/^@/, '').toLowerCase()
  if (!cleaned) return

  const admin = createAdminClient()
  if (!(await isEventHost(admin, eventId, profileId))) return

  // Resolve the handle to a real profile. A cohost must exist and not be the host.
  const { data: target } = await admin
    .from('profiles')
    .select('id')
    .eq('handle', cleaned)
    .maybeSingle()
  if (!target || target.id === profileId) return

  // Unique (event_id, profile_id) — ignore a duplicate add.
  const { error } = await admin
    .from('event_cohosts')
    .insert({
      event_id: eventId,
      profile_id: target.id,
      added_by: profileId,
    })
  if (error && !error.message.includes('duplicate')) {
    console.error('[addCohost]', error.message)
    return
  }

  revalidateEvent(slug)
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

  await setRsvp({
    eventId,
    profileId,
    status: args.status,
    plusOneNames: args.plusOneNames,
    declineReason: args.declineReason,
    approvalStatus: args.approvalStatus,
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

// Per-event mute: a guest silences Event Dispatch fan-out for this one event.
// Self-authorized (only the caller's own row).
export async function setEventRsvpMuted(eventId: string, slug: string, muted: boolean) {
  const profileId = await getMyProfileId()
  if (!profileId) return

  await setRsvpMuted(eventId, profileId, muted)
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
) {
  const profileId = await getMyProfileId()
  if (!profileId) return

  const admin = createAdminClient()
  const isAuthor =
    (await isEventHost(admin, eventId, profileId)) || (await isEventCohost(eventId, profileId))
  if (!isAuthor) return

  const body = (args.body ?? '').trim()
  if (!body) return

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

  revalidateEvent(slug)
}
