'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { getMyProfileId } from '@/lib/auth'
import { cancelAudit, reinstateAudit } from '@/lib/events/event-lifecycle'
import { logAdminAction } from '@/lib/admin/audit'
import { slugify } from '@/lib/utils'
import { saveEventLocation, type EventAddress } from '@/lib/events/geocode'
import { nominatimGeocoder } from '@/lib/events/geocode-provider'
import {
  CATEGORY_VALUES,
  VISIBILITY_VALUES,
  coerceEnergyTag,
  coerceAttendanceMode,
} from '@/lib/events/options'
import { wallClockToIso, dateToWallClockIso } from '@/lib/events/datetime'
import { validateRecurrenceUntil, type RecurrenceType } from '@/lib/events/recurrence'
import { isValidTimeZone } from '@/lib/time/zone'
import { posterSignedUrl } from '@/lib/events/poster-media'
import { pointFromGeog } from '@/lib/events/geo'
import { approveRsvp } from '@/lib/events/rsvp-depth'
import {
  loadRoster,
  loadAnalytics,
  loadPendingApprovals,
  type ManageGuest,
  type PendingGuest,
} from '@/app/(main)/events/[slug]/manage/load'

const RECURRENCE_VALUES: ReadonlySet<string> = new Set(['none', 'daily', 'weekly', 'monthly'])

const MAX_GALLERY_IMAGES = 12

// In-place "Event settings" admin module (EMBEDDED-ADMIN.md / ADR-133). Read +
// write both re-resolve event.editSettings server-side (the dock's role gate is UX;
// this is the authority — the admin client bypasses RLS). Cancel/reinstate lives
// here too (the header kebab is gone; Settings is the one host surface).

// The admin client's generated types don't cover every events column used below
// (cover_image_path / capacity / attendance_mode / slug are newer than the generated
// types — repo convention; see app/(main)/events/index-data.ts). Cast to an untyped
// update surface for those, with the capability gate as the real authority.
type UntypedUpdate = {
  from: (t: string) => {
    update: (v: Record<string, unknown>) => {
      eq: (c: string, val: string) => Promise<{ error: { message: string } | null }>
    }
  }
}

export async function getEventAdminData(slug: string) {
  const admin = createAdminClient()
  // cover_image_path / capacity / attendance_mode are newer than the generated DB
  // types — read them through an untyped client (repo convention).
  const { data: event } = await (admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: EventAdminRow | null }> }
      }
    }
  })
    .from('events')
    .select(
      'id, slug, title, description, location, starts_at, ends_at, is_cancelled, cover_image_path, poster_path, gallery_image_paths, capacity, attendance_mode, online_url, venue_name, street, city, region, country, postal_code, category, visibility, energy_tag, geog',
    )
    .eq('slug', slug)
    .maybeSingle()
  if (!event) return null

  const caps = await getEventCapabilities(event.id)
  if (!caps.has('event.editSettings')) return null

  // Cover lives as a storage PATH in the public `event-media` bucket (mirrors
  // event-activity / recap-album; see index-data.ts ~400). Resolve it to a public
  // URL for InlineCover to display — the stored value stays a path.
  const coverUrl = event.cover_image_path
    ? admin.storage.from('event-media').getPublicUrl(event.cover_image_path).data.publicUrl
    : null

  // The original scanned poster lives in the PRIVATE poster bucket → short-lived signed
  // URL for the Photos manager to preview. Uploaded gallery images are public.
  const posterUrl = await posterSignedUrl(event.poster_path)
  const galleryPaths = event.gallery_image_paths ?? []
  const galleryItems = galleryPaths.map((p) => ({
    path: p,
    url: admin.storage.from('event-media').getPublicUrl(p).data.publicUrl,
  }))

  // Decode the saved geog point (PostgREST serialises a PostGIS geography as GeoJSON,
  // {type, coordinates:[lng,lat]}) so the editor's draggable pin can seed from it.
  // Same decode the dispatch-audience resolver uses; null when never geocoded.
  const point = pointFromGeog(event.geog)

  return { ...event, coverUrl, posterUrl, galleryPaths, galleryItems, lat: point?.lat ?? null, lng: point?.lng ?? null }
}

type EventAdminRow = {
  id: string
  slug: string
  title: string
  description: string | null
  location: string | null
  starts_at: string | null
  ends_at: string | null
  is_cancelled: boolean
  cover_image_path: string | null
  poster_path: string | null
  gallery_image_paths: string[] | null
  capacity: number | null
  attendance_mode: string | null
  online_url: string | null
  venue_name: string | null
  street: string | null
  city: string | null
  region: string | null
  country: string | null
  postal_code: string | null
  category: string | null
  visibility: string | null
  energy_tag: string | null
  geog: unknown
}

/** Cancel or reinstate the event — the host control that used to live in the
 *  header kebab. Same capability gate as the rest of this module. */
export async function setEventCancelled(id: string, slug: string, cancelled: boolean) {
  const caps = await getEventCapabilities(id)
  if (!caps.has('event.editSettings')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const update = cancelled ? cancelAudit(await getMyProfileId(), null) : reinstateAudit()
  const { error } = await admin.from('events').update(update).eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/events/${slug}`)
  revalidatePath('/events')
  revalidatePath('/feed')
}

export async function updateEventSettings(id: string, slug: string, fd: FormData) {
  const caps = await getEventCapabilities(id)
  if (!caps.has('event.editSettings')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const startsAt = fd.get('starts_at') as string
  const endsAt = fd.get('ends_at') as string
  if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) {
    throw new Error('End time must be after the start time.')
  }

  // Capacity: empty clears to null (unlimited); otherwise a positive integer (parseInt would let a
  // negative through, so require > 0).
  const capacityRaw = ((fd.get('capacity') as string) ?? '').trim()
  const capacityParsed = capacityRaw ? parseInt(capacityRaw, 10) : NaN
  const capacity = Number.isFinite(capacityParsed) && capacityParsed > 0 ? capacityParsed : null

  const attendanceMode = coerceAttendanceMode(fd.get('attendance_mode'))

  // Title is required and must not be blank — guard before deref (a malformed POST may have
  // no 'title' field, and createEvent/updateEvent both reject an empty title).
  const title = ((fd.get('title') as string | null) ?? '').trim()
  if (!title) throw new Error('Title is required.')

  // Category / visibility are CHECK-constrained enums — only write a recognised value (an
  // unlisted string would 500 on the constraint), otherwise leave the column unchanged.
  const categoryRaw = ((fd.get('category') as string) ?? '').trim()
  const visibilityRaw = ((fd.get('visibility') as string) ?? '').trim()
  const category = CATEGORY_VALUES.has(categoryRaw) ? categoryRaw : undefined
  const visibility = VISIBILITY_VALUES.has(visibilityRaw) ? visibilityRaw : undefined
  const energyTag = coerceEnergyTag(fd.get('energy_tag'))

  const { error } = await (admin as unknown as UntypedUpdate)
    .from('events')
    .update({
      title,
      description: ((fd.get('description') as string) ?? '').trim() || null,
      location: ((fd.get('location') as string) ?? '').trim() || null,
      // UTC-naive: keep the picked wall-clock literally, not tz-shifted (lib/events/datetime).
      starts_at: startsAt ? (wallClockToIso(startsAt) ?? undefined) : undefined,
      ends_at: endsAt ? wallClockToIso(endsAt) : null,
      capacity,
      energy_tag: energyTag,
      ...(category ? { category } : {}),
      ...(visibility ? { visibility } : {}),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)

  // Structured address + online link + attendance mode go through the shared geocode-on-save
  // hook (createEvent uses the same): it persists the address columns + online_url +
  // attendance_mode, and resolves events.geog when a geocoder is wired. Best-effort, so a geo
  // miss never fails the save. Hidden inputs (e.g. address on an online event) arrive empty →
  // cleared, which is the intended behaviour.
  const address: EventAddress = {
    venueName: ((fd.get('venue_name') as string) ?? '').trim() || null,
    street: ((fd.get('street') as string) ?? '').trim() || null,
    city: ((fd.get('city') as string) ?? '').trim() || null,
    region: ((fd.get('region') as string) ?? '').trim() || null,
    country: ((fd.get('country') as string) ?? '').trim() || null,
    postalCode: ((fd.get('postal_code') as string) ?? '').trim() || null,
    // Free-text fallback: geocode the one-line `location` when the structured fields are empty
    // (e.g. a Vera-scanned or onboarding-entered address), so the map pin still populates.
    query: ((fd.get('location') as string) ?? '').trim() || null,
  }
  const onlineUrl = ((fd.get('online_url') as string) ?? '').trim() || null

  // Manual map pin (Event settings overhaul §5): the editor submits the dragged
  // marker's lat/lng as hidden inputs. A valid pair OVERRIDES the best-effort
  // geocode — the host placed it, so it's the truth. Empty/NaN → fall back to
  // geocode-on-save (no behaviour change for events without a pin).
  const latRaw = ((fd.get('lat') as string) ?? '').trim()
  const lngRaw = ((fd.get('lng') as string) ?? '').trim()
  const latNum = latRaw ? Number(latRaw) : NaN
  const lngNum = lngRaw ? Number(lngRaw) : NaN
  const point =
    Number.isFinite(latNum) && Number.isFinite(lngNum) && Math.abs(latNum) <= 90 && Math.abs(lngNum) <= 180
      ? { lat: latNum, lng: lngNum }
      : null

  // A manual pin wins; otherwise geocode-on-save resolves the point from the address (the edit
  // path previously passed NO geocoder, so an address with no dragged pin never set events.geog).
  await saveEventLocation(id, { address, attendanceMode, onlineUrl, point, geocoder: nominatimGeocoder })

  revalidatePath(`/events/${slug}`)
  revalidatePath('/events')
  revalidatePath('/feed')
}

/**
 * Promote the original scanned poster (poster_path, in the PRIVATE network-contacts
 * bucket) to the public cover (cover_image_path, in event-media). Used when a host
 * captured the event by scanning a poster — it lands as the poster with no cover, so
 * this one tap reuses that image as the cover. Copies the bytes into the public
 * bucket (the poster bucket stays private) and persists the new path. Same gate.
 */
export async function useEventPosterAsCover(
  id: string,
  slug: string,
): Promise<{ url: string } | { error: string }> {
  const caps = await getEventCapabilities(id)
  if (!caps.has('event.editSettings')) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: ev } = await admin.from('events').select('poster_path').eq('id', id).maybeSingle()
  const posterPath = (ev as { poster_path?: string | null } | null)?.poster_path ?? null
  if (!posterPath) return { error: 'There is no poster to use.' }

  // Pull the poster bytes from the private bucket, write them into the public cover bucket.
  const { data: blob, error: dlErr } = await admin.storage.from('network-contacts').download(posterPath)
  if (dlErr || !blob) return { error: dlErr?.message ?? 'Could not read the poster.' }

  const ext = (posterPath.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${id}/cover-from-poster-${Date.now()}.${ext}`
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const { error: upErr } = await admin.storage
    .from('event-media')
    .upload(path, bytes, { contentType: blob.type || 'image/jpeg', upsert: false })
  if (upErr) return { error: upErr.message }

  const { error: dbErr } = await (admin as unknown as UntypedUpdate)
    .from('events')
    .update({ cover_image_path: path })
    .eq('id', id)
  if (dbErr) return { error: dbErr.message }

  const { data } = admin.storage.from('event-media').getPublicUrl(path)

  revalidatePath(`/events/${slug}`)
  revalidatePath('/events')
  revalidatePath('/feed')
  return { url: data.publicUrl }
}

// Field-level patch for the inline tuning layer (ADR-138). Allowlisted; re-checks
// event.editSettings, same as the full settings form.
const INLINE_FIELDS = ['title', 'description'] as const
type InlineField = (typeof INLINE_FIELDS)[number]

export async function updateEventField(id: string, slug: string, field: InlineField, value: string) {
  if (!INLINE_FIELDS.includes(field)) throw new Error('Invalid field')

  const caps = await getEventCapabilities(id)
  if (!caps.has('event.editSettings')) throw new Error('Unauthorized')

  const trimmed = value.trim()
  if (field === 'title' && !trimmed) throw new Error('Title is required')

  const admin = createAdminClient()
  const { error } = await admin
    .from('events')
    .update(field === 'title' ? { title: trimmed } : { description: trimmed || null })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/events/${slug}`)
  revalidatePath('/events')
  revalidatePath('/feed')
}

// Cover image: upload to the PUBLIC `event-media` bucket and persist the storage
// PATH in events.cover_image_path (resolved to a public URL at read time via
// getPublicUrl — see index-data.ts), or clear it. Both re-check event.editSettings
// (capabilities are law; the admin client bypasses RLS). Mirrors uploadCircleCover,
// but events store a PATH, not the full URL, so the upload returns the resolved URL
// for InlineCover to preview while the column keeps the path.
export async function uploadEventCover(
  id: string,
  slug: string,
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  const caps = await getEventCapabilities(id)
  if (!caps.has('event.editSettings')) return { error: 'Unauthorized' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No file selected.' }
  if (file.size > 8 * 1024 * 1024) return { error: 'Image must be under 8MB.' }
  // Safe raster types only (defense in depth: the event-media bucket constrains MIME, but the
  // action should too). SVG excluded deliberately (it can carry script).
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(file.type)) {
    return { error: 'Use a JPEG, PNG, WebP, GIF, or AVIF image.' }
  }

  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${id}/cover-${Date.now()}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error: upErr } = await admin.storage
    .from('event-media')
    .upload(path, bytes, { contentType: file.type || 'image/jpeg', upsert: false })
  if (upErr) return { error: upErr.message }

  // Persist the PATH (not the public URL) — events resolve the URL at read time.
  const { error: dbErr } = await (admin as unknown as UntypedUpdate)
    .from('events')
    .update({ cover_image_path: path })
    .eq('id', id)
  if (dbErr) return { error: dbErr.message }

  const { data } = admin.storage.from('event-media').getPublicUrl(path)

  revalidatePath(`/events/${slug}`)
  revalidatePath('/events')
  revalidatePath('/feed')
  return { url: data.publicUrl }
}

export async function removeEventCover(id: string, slug: string) {
  const caps = await getEventCapabilities(id)
  if (!caps.has('event.editSettings')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await (admin as unknown as UntypedUpdate)
    .from('events')
    .update({ cover_image_path: null })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/events/${slug}`)
  revalidatePath('/events')
  revalidatePath('/feed')
}

/** Remove the original scanned poster image from the event (clears poster_path, so the
 *  header falls back to the uploaded cover or the date placeholder). Same capability gate. */
export async function removeEventPoster(id: string, slug: string) {
  const caps = await getEventCapabilities(id)
  if (!caps.has('event.editSettings')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await (admin as unknown as UntypedUpdate)
    .from('events')
    .update({ poster_path: null })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/events/${slug}`)
  revalidatePath('/events')
  revalidatePath('/feed')
}

/** Replace the event's uploaded gallery images (events.gallery_image_paths). Used by the
 *  Photos manager to add or delete photos. Validates + caps the array; same gate. */
export async function setEventGalleryImages(
  id: string,
  slug: string,
  paths: string[],
): Promise<{ ok: true } | { error: string }> {
  const caps = await getEventCapabilities(id)
  if (!caps.has('event.editSettings')) return { error: 'Unauthorized' }

  const clean = (Array.isArray(paths) ? paths : [])
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .map((p) => p.trim())
    .slice(0, MAX_GALLERY_IMAGES)

  const admin = createAdminClient()
  const { error } = await (admin as unknown as UntypedUpdate)
    .from('events')
    .update({ gallery_image_paths: clean })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(`/events/${slug}`)
  revalidatePath('/events')
  revalidatePath('/feed')
  return { ok: true }
}

/** Rename an event's permalink. Slugifies the input, rejects empty, and ensures the
 *  new slug is unique across events before writing. Returns the new slug so the
 *  client can redirect the page. Re-checks event.editSettings. */
export async function updateEventPermalink(
  id: string,
  slug: string,
  newSlug: string,
): Promise<{ slug: string } | { error: string }> {
  const caps = await getEventCapabilities(id)
  if (!caps.has('event.editSettings')) return { error: 'Unauthorized' }

  const next = slugify(newSlug ?? '')
  if (!next) return { error: 'Permalink cannot be empty.' }

  const admin = createAdminClient()

  if (next !== slug) {
    const { data: clash } = await admin
      .from('events')
      .select('id')
      .eq('slug', next)
      .neq('id', id)
      .maybeSingle()
    if (clash) return { error: 'That permalink is already taken.' }
  }

  const { error } = await (admin as unknown as UntypedUpdate)
    .from('events')
    .update({ slug: next })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(`/events/${slug}`)
  revalidatePath(`/events/${next}`)
  revalidatePath('/events')
  revalidatePath('/feed')
  return { slug: next }
}

/**
 * Permanently delete an event. Gated on event.editSettings (its host, a manager of
 * the parent circle, or staff) — the same gate as editing it; the re-check is the
 * FIRST statement. Distinct from cancelling (is_cancelled), which stays the everyday
 * host action. FK cascades clear RSVPs + check-in engagement. Irreversible; the UI
 * requires a confirm and warns about a recurring series.
 */
export async function deleteEvent(eventId: string, slug: string): Promise<{ error?: string }> {
  const caps = await getEventCapabilities(eventId)
  if (!caps.has('event.editSettings')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { data: ev } = await admin.from('events').select('title').eq('id', eventId).maybeSingle()

  const { error } = await admin.from('events').delete().eq('id', eventId)
  if (error) return { error: error.message }

  const actorId = await getMyProfileId().catch(() => null)
  await logAdminAction({
    actorId,
    action: 'event.delete',
    targetType: 'event',
    targetId: eventId,
    detail: { slug, title: (ev as { title?: string } | null)?.title ?? null },
  })

  revalidatePath('/events')
  revalidatePath('/admin/events')
  revalidatePath('/feed')
  return {}
}

// ─── Place & Time (the 'place' spine module) ───────────────────────────────────
// When/where lives in its own admin module (event-place-time-module). Read + write both
// re-resolve event.editSettings server-side (the admin client bypasses RLS). The booking
// window has no dedicated column, so it rides in events.details.rsvpWindow (a read-merge-write
// that preserves the poster-harvest keys). time_zone / recurrence_* are on the events table.

type PlaceTimeRow = {
  id: string
  slug: string
  starts_at: string | null
  ends_at: string | null
  location: string | null
  attendance_mode: string | null
  online_url: string | null
  venue_name: string | null
  street: string | null
  city: string | null
  region: string | null
  country: string | null
  postal_code: string | null
  geog: unknown
  time_zone: string | null
  recurrence_type: string | null
  recurrence_until: string | null
  details: Record<string, unknown> | null
}

/** The when/where + booking-window inputs the Place & Time module edits. Returns null unless
 *  the caller holds event.editSettings (visibility is enforced here, not in the client). */
export async function getEventPlaceTimeData(slug: string) {
  const admin = createAdminClient()
  // time_zone / recurrence_* / details are newer than (or outside) the generated types — read
  // them through an untyped client (repo convention; see getEventAdminData).
  const { data: event } = await (admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: PlaceTimeRow | null }> }
      }
    }
  })
    .from('events')
    .select(
      'id, slug, starts_at, ends_at, location, attendance_mode, online_url, venue_name, street, city, region, country, postal_code, geog, time_zone, recurrence_type, recurrence_until, details',
    )
    .eq('slug', slug)
    .maybeSingle()
  if (!event) return null

  const caps = await getEventCapabilities(event.id)
  if (!caps.has('event.editSettings')) return null

  const point = pointFromGeog(event.geog)
  const window = readRsvpWindow(event.details)

  return {
    ...event,
    lat: point?.lat ?? null,
    lng: point?.lng ?? null,
    rsvpOpensAt: window.opensAt,
    rsvpClosesAt: window.closesAt,
  }
}

/** The booking window persisted in events.details.rsvpWindow, or a blank pair. */
function readRsvpWindow(details: Record<string, unknown> | null): {
  opensAt: string | null
  closesAt: string | null
} {
  const w = details && typeof details === 'object' ? (details.rsvpWindow as unknown) : null
  if (!w || typeof w !== 'object') return { opensAt: null, closesAt: null }
  const o = w as Record<string, unknown>
  return {
    opensAt: typeof o.opensAt === 'string' ? o.opensAt : null,
    closesAt: typeof o.closesAt === 'string' ? o.closesAt : null,
  }
}

export async function updateEventPlaceTime(id: string, slug: string, fd: FormData) {
  const caps = await getEventCapabilities(id)
  if (!caps.has('event.editSettings')) throw new Error('Unauthorized')

  const admin = createAdminClient()

  const startsAtRaw = fd.get('starts_at') as string
  const endsAtRaw = fd.get('ends_at') as string
  if (startsAtRaw && endsAtRaw && new Date(endsAtRaw) < new Date(startsAtRaw)) {
    throw new Error('End time must be after the start time.')
  }
  const startsAtIso = startsAtRaw ? wallClockToIso(startsAtRaw) : null
  const endsAtIso = endsAtRaw ? wallClockToIso(endsAtRaw) : null

  // Recurrence: only a recognised cadence is written (the column is CHECK-constrained); the
  // repeat-until is a date input, validated against the start so a series with zero occurrences
  // can't be saved.
  const recurrenceRaw = ((fd.get('recurrence_type') as string) ?? '').trim()
  const recurrence = RECURRENCE_VALUES.has(recurrenceRaw) ? (recurrenceRaw as RecurrenceType) : 'none'
  const untilIso = recurrence === 'none' ? null : dateToWallClockIso(fd.get('recurrence_until') as string)
  const recurrenceError = validateRecurrenceUntil(recurrence, startsAtIso, untilIso)
  if (recurrenceError) throw new Error(recurrenceError)

  // Time zone: only a valid IANA zone is written, else the column is left unchanged.
  const zoneRaw = ((fd.get('time_zone') as string) ?? '').trim()
  const timeZone = isValidTimeZone(zoneRaw) ? zoneRaw : undefined

  // Booking window (no dedicated column): read the current details, merge the window, write it
  // back so the poster-harvest keys survive. Both blank clears the window.
  const opensAt = wallClockToIso(fd.get('rsvp_opens_at') as string)
  const closesAt = wallClockToIso(fd.get('rsvp_closes_at') as string)
  const { data: current } = await admin.from('events').select('details').eq('id', id).maybeSingle()
  const baseDetails = ((current as { details?: Record<string, unknown> | null } | null)?.details ?? {}) as Record<
    string,
    unknown
  >
  const nextDetails: Record<string, unknown> = { ...baseDetails }
  if (opensAt || closesAt) nextDetails.rsvpWindow = { opensAt, closesAt }
  else delete nextDetails.rsvpWindow

  const { error } = await (admin as unknown as UntypedUpdate)
    .from('events')
    .update({
      // UTC-naive wall-clock kept literally (lib/events/datetime); an empty start leaves it.
      starts_at: startsAtIso ?? undefined,
      ends_at: endsAtIso,
      recurrence_type: recurrence,
      recurrence_until: untilIso,
      ...(timeZone ? { time_zone: timeZone } : {}),
      details: nextDetails,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)

  // Structured address + online link + attendance mode + manual pin go through the shared
  // geocode-on-save hook (createEvent / updateEventSettings use the same). Best-effort, so a geo
  // miss never fails the save.
  const address: EventAddress = {
    venueName: ((fd.get('venue_name') as string) ?? '').trim() || null,
    street: ((fd.get('street') as string) ?? '').trim() || null,
    city: ((fd.get('city') as string) ?? '').trim() || null,
    region: ((fd.get('region') as string) ?? '').trim() || null,
    country: ((fd.get('country') as string) ?? '').trim() || null,
    postalCode: ((fd.get('postal_code') as string) ?? '').trim() || null,
    query: ((fd.get('location') as string) ?? '').trim() || null,
  }
  const onlineUrl = ((fd.get('online_url') as string) ?? '').trim() || null
  const attendanceMode = coerceAttendanceMode(fd.get('attendance_mode'))

  const latRaw = ((fd.get('lat') as string) ?? '').trim()
  const lngRaw = ((fd.get('lng') as string) ?? '').trim()
  const latNum = latRaw ? Number(latRaw) : NaN
  const lngNum = lngRaw ? Number(lngRaw) : NaN
  const point =
    Number.isFinite(latNum) && Number.isFinite(lngNum) && Math.abs(latNum) <= 90 && Math.abs(lngNum) <= 180
      ? { lat: latNum, lng: lngNum }
      : null

  await saveEventLocation(id, { address, attendanceMode, onlineUrl, point, geocoder: nominatimGeocoder })

  revalidatePath(`/events/${slug}`)
  revalidatePath('/events')
  revalidatePath('/feed')
}

// ─── People (the 'people' spine module) ────────────────────────────────────────
// RSVP roster summary, the approval queue, waitlist, and capacity. Re-uses the host Manage
// Dashboard's read layer (loadRoster / loadAnalytics / loadPendingApprovals). Gated on
// event.editSettings (the same principals who moderate the event); the read returns null for
// anyone else so the module renders nothing.

export interface EventPeopleData {
  eventId: string
  analytics: Awaited<ReturnType<typeof loadAnalytics>>
  pending: PendingGuest[]
  guests: ManageGuest[]
}

export async function getEventPeopleData(slug: string): Promise<EventPeopleData | null> {
  const admin = createAdminClient()
  const { data: ev } = await admin.from('events').select('id').eq('slug', slug).maybeSingle()
  if (!ev) return null

  const caps = await getEventCapabilities(ev.id)
  if (!caps.has('event.editSettings')) return null

  const roster = await loadRoster(ev.id)
  const [analytics, pending] = await Promise.all([loadAnalytics(ev.id, roster), loadPendingApprovals(ev.id)])
  // The compact module shows the first slice of the roster; the full list lives on Manage.
  return { eventId: ev.id, analytics, pending, guests: roster.slice(0, 8) }
}

/** Host approves a guest waiting in the approval queue. Re-checks event.editSettings (the admin
 *  client bypasses RLS, so this action is the authority). */
export async function approveEventRsvp(
  eventId: string,
  slug: string,
  profileId: string,
): Promise<{ ok: true } | { error: string }> {
  const caps = await getEventCapabilities(eventId)
  if (!caps.has('event.editSettings')) return { error: 'Unauthorized' }

  await approveRsvp(eventId, profileId)

  revalidatePath(`/events/${slug}`)
  revalidatePath(`/events/${slug}/manage`)
  return { ok: true }
}

// ─── Engage (the 'engage' spine module) ────────────────────────────────────────
// Tickets, offerings, and check-in. A free RSVP event has no ticket price; adding one turns on
// paid tickets (events.price_cents). Sold-ticket + check-in counts are read for the summary.
// Read + write re-check event.editSettings.

export interface EventEngageData {
  eventId: string
  priceCents: number | null
  currency: string
  ticketsSold: number
  revenueCents: number
  checkedIn: number
  going: number
}

export async function getEventEngageData(slug: string): Promise<EventEngageData | null> {
  const admin = createAdminClient()
  const { data: ev } = await (admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (c: string, v: string) => {
          maybeSingle: () => Promise<{
            data: { id: string; price_cents: number | null; currency: string | null } | null
          }>
        }
      }
    }
  })
    .from('events')
    .select('id, price_cents, currency')
    .eq('slug', slug)
    .maybeSingle()
  if (!ev) return null

  const caps = await getEventCapabilities(ev.id)
  if (!caps.has('event.editSettings')) return null

  const [ticketsRes, goingRes, checkinRes] = await Promise.all([
    admin.from('event_tickets').select('amount_cents, qty, status').eq('event_id', ev.id),
    admin
      .from('event_rsvps')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', ev.id)
      .eq('status', 'going'),
    admin
      .from('engagement_events')
      .select('actor_profile_id')
      .eq('event_type', 'practice.verified')
      .like('idempotency_key', `event_checkin:${ev.id}:%`),
  ])

  const tickets = (ticketsRes.data ?? []) as { amount_cents: number; qty: number; status: string }[]
  const succeeded = tickets.filter((t) => t.status === 'succeeded')
  const ticketsSold = succeeded.reduce((sum, t) => sum + (t.qty ?? 1), 0)
  const revenueCents = succeeded.reduce((sum, t) => sum + (t.amount_cents ?? 0), 0)
  const checkedIn = new Set(
    ((checkinRes.data ?? []) as { actor_profile_id: string | null }[])
      .map((r) => r.actor_profile_id)
      .filter((v): v is string => !!v),
  ).size

  return {
    eventId: ev.id,
    priceCents: ev.price_cents ?? null,
    currency: ev.currency ?? 'usd',
    ticketsSold,
    revenueCents,
    checkedIn,
    going: goingRes.count ?? 0,
  }
}

/** Set (or clear) the event's ticket price. Blank / 0 clears it back to a free RSVP event.
 *  Re-checks event.editSettings. Purchases still move only through the service-role checkout. */
export async function updateEventPricing(
  id: string,
  slug: string,
  fd: FormData,
): Promise<{ ok: true } | { error: string }> {
  const caps = await getEventCapabilities(id)
  if (!caps.has('event.editSettings')) return { error: 'Unauthorized' }

  // Price arrives in whole currency units; store cents. Blank / non-positive clears to free.
  const raw = ((fd.get('price') as string) ?? '').trim()
  const amount = raw ? Number(raw) : NaN
  const priceCents = Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null

  const admin = createAdminClient()
  const { error } = await (admin as unknown as UntypedUpdate)
    .from('events')
    .update({ price_cents: priceCents })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(`/events/${slug}`)
  revalidatePath('/events')
  return { ok: true }
}
