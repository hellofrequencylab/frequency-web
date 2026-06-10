'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { isEventCohost } from '@/lib/events/cohosts'

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
