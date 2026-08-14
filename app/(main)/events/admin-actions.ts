'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/database.types'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { loadEventCoreStats, type EventCoreStats } from '@/lib/events/event-stats'
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
  coerceVisibilityForScope,
} from '@/lib/events/options'
import { wallClockToIso, dateToWallClockIso } from '@/lib/events/datetime'
import { validateRecurrenceUntil, type RecurrenceType } from '@/lib/events/recurrence'
import { isValidTimeZone } from '@/lib/time/zone'
import { posterSignedUrl } from '@/lib/events/poster-media'
import { writeEventHeroHeight, type EventHeroHeight } from '@/lib/events/hero-height'
import { writeEventCoverFocus } from '@/lib/events/cover-focus'
import { writeEventMarketListed } from '@/lib/events/market-listing'
import { pointFromGeog } from '@/lib/events/geo'
import { approveRsvpById } from '@/lib/events/rsvp-depth'
import { sendRsvpApprovedNotice } from '@/lib/events/guest-rsvp-email'
import {
  copyEventMediaToProfileLoom,
  resolveProfileLoomSpaceId,
  getPickableLoomImage,
} from '@/lib/library/event-loom'
import { searchSpaceLibraryImages, type LibraryImagePick } from '@/lib/library/store'
import {
  loadRoster,
  loadAnalytics,
  loadPendingApprovals,
  type ManageGuest,
  type PendingGuest,
} from '@/app/(main)/events/[slug]/manage/load'

/** The untyped update surface (ADR-246), for columns that lib/database.types.ts predates. */
type UntypedUpdate = {
  from: (table: string) => {
    update: (patch: Record<string, unknown>) => {
      eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>
    }
  }
}

const RECURRENCE_VALUES: ReadonlySet<string> = new Set(['none', 'daily', 'weekly', 'monthly'])

const MAX_GALLERY_IMAGES = 12

/**
 * The signed-in viewer's home {lat,lng} from their profile, or null. Used to DEFAULT the venue
 * autocomplete's location bias when an event has no pin yet (Event settings overhaul: local-first
 * address search). People almost always post events near home, so biasing the first, local-bounded
 * Photon pass to the host's home surfaces the right local address instead of a far-flung same-named
 * street. Best-effort — a viewer with no saved home just gets the unbiased worldwide search.
 */
export async function getViewerHome(): Promise<{ lat: number; lng: number } | null> {
  const profileId = await getMyProfileId().catch(() => null)
  if (!profileId) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('home_lat, home_lng')
    .eq('id', profileId)
    .maybeSingle()
  const row = data as { home_lat?: number | null; home_lng?: number | null } | null
  const lat = row?.home_lat != null ? Number(row.home_lat) : NaN
  const lng = row?.home_lng != null ? Number(row.home_lng) : NaN
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}

// In-place "Event settings" admin module (EMBEDDED-ADMIN.md / ADR-133). Read +
// write both re-resolve event.editSettings server-side (the dock's role gate is UX;
// this is the authority — the admin client bypasses RLS). Cancel/reinstate lives
// here too (the header kebab is gone; Settings is the one host surface).

// Almost every events column used below is covered by the regenerated DB types, so reads and
// writes go through the typed admin client. The rows below keep their app-facing shapes (join_mode
// narrowed to its vocabulary, details as a plain record) via a narrowing assertion on the typed read.
//
// ONE EXCEPTION, and it reopens ADR-246 for this file: `rsvp_requires_approval` (20270303000000)
// is live in the database and absent from lib/database.types.ts, so the typed Update types it as
// `never` and rejects the write. The update call therefore goes through `UntypedUpdate` above. The
// cast is on the CALL rather than on the patch object, so every other field in that patch stays
// fully checked — and it comes back out the moment the types are regenerated.

export async function getEventAdminData(slug: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('events')
    .select(
      'id, slug, title, description, location, starts_at, ends_at, is_cancelled, cover_image_path, poster_path, gallery_image_paths, capacity, attendance_mode, online_url, venue_name, street, city, region, country, postal_code, category, visibility, energy_tag, theme, price_cents, currency, time_zone, recurrence_type, recurrence_until, details, geog, hide_address, join_mode, scope_type, rsvp_requires_approval',
    )
    .eq('slug', slug)
    .maybeSingle()
  const event = data as EventAdminRow | null
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
  // Unified gallery (event image editor rework): the FIRST gallery image IS the header/cover. Seed
  // the editor's gallery so the cover LEADS it — for events created before the unification (a cover
  // set separately from the gallery), the cover surfaces as the first tile with no migration. The
  // next gallery save normalises the row (setEventGalleryImages keeps cover_image_path = gallery[0]).
  const rawGallery = event.gallery_image_paths ?? []
  const galleryPaths =
    event.cover_image_path && !rawGallery.includes(event.cover_image_path)
      ? [event.cover_image_path, ...rawGallery]
      : rawGallery
  const galleryItems = galleryPaths.map((p) => ({
    path: p,
    url: admin.storage.from('event-media').getPublicUrl(p).data.publicUrl,
  }))

  // Decode the saved geog point (PostgREST serialises a PostGIS geography as GeoJSON,
  // {type, coordinates:[lng,lat]}) so the editor's draggable pin can seed from it.
  // Same decode the dispatch-audience resolver uses; null when never geocoded.
  const point = pointFromGeog(event.geog)
  // The viewer's home, to DEFAULT the venue autocomplete bias when this event has no pin yet
  // (local-first address search). Null for a viewer with no saved home.
  const viewerHome = await getViewerHome()
  // Booking window rides in events.details.rsvpWindow (no dedicated column).
  const window = readRsvpWindow(event.details)

  return {
    ...event,
    coverUrl,
    posterUrl,
    galleryPaths,
    galleryItems,
    lat: point?.lat ?? null,
    lng: point?.lng ?? null,
    viewerHome,
    rsvpOpensAt: window.opensAt,
    rsvpClosesAt: window.closesAt,
  }
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
  theme: unknown
  price_cents: number | null
  currency: string | null
  time_zone: string | null
  recurrence_type: string | null
  recurrence_until: string | null
  details: Record<string, unknown> | null
  geog: unknown
  /** ADR-825: exact address renders only for registered viewers / managers. */
  hide_address: boolean | null
  /** 20270303000000. Newer than lib/database.types.ts, so it rides the untyped read/write. */
  rsvp_requires_approval: boolean | null
  /** ADR-826: how people join — auto / rsvp (first come first served) / tickets. */
  join_mode: 'auto' | 'rsvp' | 'tickets' | null
  /** The event's ONE home (ADR-883). The settings module needs it so the "My circle"
   *  visibility option is only offered when there IS a circle to scope to. */
  scope_type: string | null
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

  // Ticket price (folded in from the retired Engage module): whole currency units → cents; blank /
  // non-positive clears back to a free RSVP event. Purchases still move only through the
  // service-role checkout — this only sets the price column.
  const priceRaw = ((fd.get('price') as string) ?? '').trim()
  const priceAmount = priceRaw ? Number(priceRaw) : NaN
  const priceCents = Number.isFinite(priceAmount) && priceAmount > 0 ? Math.round(priceAmount * 100) : null

  // Time zone (folded in from Place & Time): only a valid IANA zone is written, else left unchanged.
  const zoneRaw = ((fd.get('time_zone') as string) ?? '').trim()
  const timeZone = isValidTimeZone(zoneRaw) ? zoneRaw : undefined

  // Recurrence (folded in from Place & Time): only a recognised cadence is written (CHECK-constrained
  // column); the repeat-until is validated against the start so a zero-occurrence series can't save.
  const recurrenceRaw = ((fd.get('recurrence_type') as string) ?? '').trim()
  const recurrence = RECURRENCE_VALUES.has(recurrenceRaw) ? (recurrenceRaw as RecurrenceType) : 'none'
  const startIsoForRec = startsAt ? wallClockToIso(startsAt) : null
  const untilIso = recurrence === 'none' ? null : dateToWallClockIso(fd.get('recurrence_until') as string)
  const recurrenceError = validateRecurrenceUntil(recurrence, startIsoForRec, untilIso)
  if (recurrenceError) throw new Error(recurrenceError)

  // Booking window (folded in from Place & Time; no dedicated column): read-merge-write into
  // events.details.rsvpWindow so the poster-harvest keys survive. Both blank clears the window.
  const opensAt = wallClockToIso(fd.get('rsvp_opens_at') as string)
  const closesAt = wallClockToIso(fd.get('rsvp_closes_at') as string)
  const { data: currentBags } = await admin
    .from('events')
    .select('details, theme, scope_type')
    .eq('id', id)
    .maybeSingle()
  const baseDetails = ((currentBags as { details?: Record<string, unknown> | null } | null)?.details ?? {}) as Record<
    string,
    unknown
  >
  const nextDetails: Record<string, unknown> = { ...baseDetails }
  if (opensAt || closesAt) nextDetails.rsvpWindow = { opensAt, closesAt }
  else delete nextDetails.rsvpWindow

  // Public listing (ADR-844): read-merge-write into events.theme beside coverFocus/heroHeight, and
  // ONLY when the form carries the control ('on'/'off'), so a form without it can never silently
  // relist an event the host took out of the listings.
  const listingRaw = fd.get('market_listed')
  const nextTheme =
    listingRaw != null
      ? writeEventMarketListed((currentBags as { theme?: unknown } | null)?.theme, listingRaw === 'on')
      : null

  // Untyped update handle (ADR-246): `rsvp_requires_approval` is a live column that
  // lib/database.types.ts has not been regenerated for, so the typed Update rejects it as `never`.
  // The cast is on the CALL, not on the patch, so every other field in this object stays checked.
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
      price_cents: priceCents,
      recurrence_type: recurrence,
      recurrence_until: untilIso,
      details: nextDetails as Json,
      ...(timeZone ? { time_zone: timeZone } : {}),
      ...(category ? { category } : {}),
      // circle_only on a non-circle scope steps down to unlisted (ADR-883) — the same
      // coercion createEvent/updateEvent apply, so /manage cannot strand an event either.
      ...(visibility
        ? {
            visibility: coerceVisibilityForScope(
              visibility,
              (currentBags as { scope_type?: string | null } | null)?.scope_type,
            ),
          }
        : {}),
      // Hidden address (ADR-825): written ONLY when the form carries the field (a controlled
      // hidden input, 'on'/'off'), so a form without the control can never silently reset it.
      ...(fd.get('hide_address') != null
        ? { hide_address: fd.get('hide_address') === 'on' }
        : {}),
      // Approval required (20270303000000): same write-only-when-present rule as hide_address.
      // Turning it on does NOT retroactively suspend anyone already holding a seat — the column is
      // read when an RSVP is created, so existing rows keep the status they were admitted with.
      ...(fd.get('rsvp_requires_approval') != null
        ? { rsvp_requires_approval: fd.get('rsvp_requires_approval') === 'on' }
        : {}),
      // Join mode (ADR-826): same write-only-when-present rule; only a recognised value writes
      // (the column is CHECK-constrained).
      ...(['auto', 'rsvp', 'tickets'].includes((fd.get('join_mode') as string) ?? '')
        ? { join_mode: fd.get('join_mode') as string }
        : {}),
      ...(nextTheme ? { theme: nextTheme as Json } : {}),
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
  // The Manage hub mounts this same settings module on its Settings tab (ADR-828) and renders the
  // event title in its header, so it revalidates with the page.
  revalidatePath(`/events/${slug}/manage`)
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
): Promise<{ url: string; paths: string[] } | { error: string }> {
  const caps = await getEventCapabilities(id)
  if (!caps.has('event.editSettings')) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: ev } = await admin
    .from('events')
    .select('poster_path, gallery_image_paths')
    .eq('id', id)
    .maybeSingle()
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

  // Unified gallery: the poster becomes the HEADER by leading the one gallery. Prepend its new
  // event-media path and keep cover_image_path = gallery[0], so it is a normal reorderable tile from
  // here on (no separate cover control).
  const before = ((ev as { gallery_image_paths?: string[] | null } | null)?.gallery_image_paths ?? []) as string[]
  const paths = [path, ...before.filter((p) => p !== path)].slice(0, MAX_GALLERY_IMAGES)

  const { error: dbErr } = await admin
    .from('events')
    .update({ cover_image_path: path, gallery_image_paths: paths })
    .eq('id', id)
  if (dbErr) return { error: dbErr.message }

  const { data } = admin.storage.from('event-media').getPublicUrl(path)

  revalidatePath(`/events/${slug}`)
  revalidatePath('/events')
  revalidatePath('/feed')
  return { url: data.publicUrl, paths }
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


/** Set the event page's hero HEIGHT (Short / Standard / Tall). Stored on the events.theme jsonb
 *  bag under `heroHeight` (read-merge-write so other theme keys survive; the default is dropped so
 *  a plain event keeps an empty theme). Same event.editSettings gate. */
export async function updateEventHeroHeight(
  id: string,
  slug: string,
  height: EventHeroHeight,
): Promise<{ ok: true } | { error: string }> {
  const caps = await getEventCapabilities(id)
  if (!caps.has('event.editSettings')) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: current } = await admin.from('events').select('theme').eq('id', id).maybeSingle()
  const nextTheme = writeEventHeroHeight((current as { theme?: unknown } | null)?.theme, height)

  const { error } = await admin
    .from('events')
    .update({ theme: nextTheme as Json })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(`/events/${slug}`)
  return { ok: true }
}

/** Set the event cover FOCAL POINT (where the cover sits in its cropped hero), a CSS
 *  `object-position` string. Stored on events.theme.coverFocus (read-merge-write so other theme
 *  keys survive; the centered default is dropped so a plain event keeps a sparse theme). Same
 *  event.editSettings gate. */
export async function updateEventCoverFocus(
  id: string,
  slug: string,
  focus: string,
): Promise<{ ok: true } | { error: string }> {
  const caps = await getEventCapabilities(id)
  if (!caps.has('event.editSettings')) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: current } = await admin.from('events').select('theme').eq('id', id).maybeSingle()
  const nextTheme = writeEventCoverFocus((current as { theme?: unknown } | null)?.theme, focus)

  const { error } = await admin
    .from('events')
    .update({ theme: nextTheme as Json })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(`/events/${slug}`)
  return { ok: true }
}


/** Remove the original scanned poster image from the event (clears poster_path, so the
 *  header falls back to the uploaded cover or the date placeholder). Same capability gate. */
export async function removeEventPoster(id: string, slug: string) {
  const caps = await getEventCapabilities(id)
  if (!caps.has('event.editSettings')) throw new Error('Unauthorized')

  const admin = createAdminClient()
  const { error } = await admin
    .from('events')
    .update({ poster_path: null })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath(`/events/${slug}`)
  revalidatePath('/events')
  revalidatePath('/feed')
}

// Gallery upload accepts what the bucket accepts (migration 20261105000000 widened event-media
// to the formats phones actually shoot). SVG is deliberately excluded (it can carry script).
const GALLERY_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'image/avif']

/**
 * Upload ONE gallery photo to the public `event-media` bucket through the SERVER (admin client),
 * returning its storage PATH. Mirrors uploadEventCover: the browser can't insert into event-media
 * directly (its RLS gates writes to `split_part(name,'/',1) = auth.uid()`, so a co-host — or the
 * host on an event scanned under another id — hit "new row violates row-level security policy").
 * Routing the write server-side, gated on event.editSettings, fixes that for every host/co-host and
 * lands the photo under the EVENT's path prefix (`${id}/…`), like the cover. The caller persists the
 * returned path into events.gallery_image_paths via setEventGalleryImages.
 */
export async function uploadEventGalleryImage(
  id: string,
  slug: string,
  formData: FormData,
): Promise<{ path: string } | { error: string }> {
  const caps = await getEventCapabilities(id)
  if (!caps.has('event.editSettings')) return { error: 'Unauthorized' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No file selected.' }
  if (file.size > 10 * 1024 * 1024) return { error: 'Image must be under 10MB.' }
  if (!GALLERY_MIME.includes(file.type)) {
    return { error: 'Use a JPEG, PNG, GIF, WebP, HEIC, or AVIF image.' }
  }

  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${id}/gallery-${crypto.randomUUID()}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { error: upErr } = await admin.storage
    .from('event-media')
    .upload(path, bytes, { contentType: file.type || 'image/jpeg', upsert: false })
  if (upErr) return { error: upErr.message }

  // Every event upload ALSO lands in the uploader's Loom, so the photo is reusable later. Best-effort:
  // a Loom miss (or a member who runs no space) never fails the event upload.
  const { data: pub } = admin.storage.from('event-media').getPublicUrl(path)
  const uploaderId = await getMyProfileId().catch(() => null)
  await copyEventMediaToProfileLoom({
    profileId: uploaderId,
    storagePath: path,
    url: pub.publicUrl,
    title: file.name.replace(/\.[^.]+$/, '') || null,
    mime: file.type || null,
    bytes: file.size,
  })

  return { path }
}

/** Replace the event's uploaded gallery images (events.gallery_image_paths). Used by the
 *  Photos manager to add or delete photos. Validates + caps the array; same gate. Any image
 *  DROPPED from the array (a removed photo) has its bytes deleted from event-media too, so
 *  removing a photo cleans up storage instead of orphaning it (best-effort; only event-scoped
 *  paths are touched). */
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

  // What was there before, so a removed photo's bytes can be cleaned up (delete works too).
  const { data: prev } = await admin.from('events').select('gallery_image_paths').eq('id', id).maybeSingle()
  const before = ((prev as { gallery_image_paths?: string[] | null } | null)?.gallery_image_paths ?? []) as string[]

  // Unified gallery: the FIRST image IS the header/cover, so keep cover_image_path = gallery[0]
  // (null when the gallery is emptied). The event page's hero reads cover_image_path, so this is
  // what makes reordering a photo to the front re-crown the header. Poster-derived covers stay
  // event-media paths, so cover and gallery are the same address space — no bucket mismatch.
  const nextCover = clean[0] ?? null

  const { error } = await admin
    .from('events')
    .update({ gallery_image_paths: clean, cover_image_path: nextCover })
    .eq('id', id)
  if (error) return { error: error.message }

  // Remove now-orphaned objects from storage. Only delete images under THIS event's own path
  // prefix (`${id}/…`) — a legacy user-prefixed path is left alone to avoid touching another
  // bucket owner's object. Best-effort: a storage miss never fails the save.
  const keep = new Set(clean)
  const orphans = before.filter((p) => !keep.has(p) && p.startsWith(`${id}/`))
  if (orphans.length) await admin.storage.from('event-media').remove(orphans).catch(() => {})

  revalidatePath(`/events/${slug}`)
  revalidatePath('/events')
  revalidatePath('/feed')
  return { ok: true }
}

/** The caller's own Loom images (their space's assets UNIONED with the shared/public library),
 *  for the "Select from Loom" picker in the event image editor. Resolves the caller's Loom space
 *  server-side (a space they own); a member with no space sees only the shared/public library.
 *  FAIL-SAFE to [] (no profile, no space, or any error). */
export async function listMyLoomImages(query?: string): Promise<LibraryImagePick[]> {
  const profileId = await getMyProfileId().catch(() => null)
  const spaceId = await resolveProfileLoomSpaceId(profileId)
  if (!spaceId) return []
  return searchSpaceLibraryImages(spaceId, query)
}

/**
 * Add a picked Loom image to the event gallery. The gallery stores event-media PATHS (so cover and
 * gallery share one address space), so this COPIES the Loom asset's bytes into event-media under the
 * event's prefix, appends the new path to the gallery, and keeps cover_image_path = gallery[0].
 * Gated on event.editSettings AND on the caller's authority to reuse that asset (their own Loom space
 * or a public shared-library asset). Returns the new full gallery array for the client to apply.
 */
export async function addEventImageFromLoom(
  id: string,
  slug: string,
  loomAssetId: string,
): Promise<{ paths: string[] } | { error: string }> {
  const caps = await getEventCapabilities(id)
  if (!caps.has('event.editSettings')) return { error: 'Unauthorized' }

  const profileId = await getMyProfileId().catch(() => null)
  const spaceId = await resolveProfileLoomSpaceId(profileId)
  const asset = await getPickableLoomImage(spaceId, loomAssetId)
  if (!asset) return { error: 'That image is not in your Loom.' }

  const admin = createAdminClient()

  // Read the bytes: prefer the source storage object (bucket + path); fall back to fetching the URL.
  let bytes: Uint8Array | null = null
  let contentType = asset.mime || 'image/jpeg'
  if (asset.storageBucket && asset.storagePath) {
    const { data: blob } = await admin.storage.from(asset.storageBucket).download(asset.storagePath)
    if (blob) {
      bytes = new Uint8Array(await blob.arrayBuffer())
      contentType = blob.type || contentType
    }
  }
  if (!bytes) {
    try {
      const res = await fetch(asset.url)
      if (res.ok) {
        bytes = new Uint8Array(await res.arrayBuffer())
        contentType = res.headers.get('content-type') || contentType
      }
    } catch {
      /* fall through to the error below */
    }
  }
  if (!bytes) return { error: 'Could not read that image. Try again.' }

  const ext = (asset.storagePath?.split('.').pop() || contentType.split('/').pop() || 'jpg')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${id}/gallery-${crypto.randomUUID()}.${ext}`
  const { error: upErr } = await admin.storage
    .from('event-media')
    .upload(path, bytes, { contentType, upsert: false })
  if (upErr) return { error: upErr.message }

  const { data: cur } = await admin.from('events').select('gallery_image_paths').eq('id', id).maybeSingle()
  const before = ((cur as { gallery_image_paths?: string[] | null } | null)?.gallery_image_paths ?? []) as string[]
  const paths = [...before, path].slice(0, MAX_GALLERY_IMAGES)
  const nextCover = paths[0] ?? null

  const { error: dbErr } = await admin
    .from('events')
    .update({ gallery_image_paths: paths, cover_image_path: nextCover })
    .eq('id', id)
  if (dbErr) return { error: dbErr.message }

  revalidatePath(`/events/${slug}`)
  revalidatePath('/events')
  revalidatePath('/feed')
  return { paths }
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

  const { error } = await admin
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
  // A space event surfaces on its Space's Calendar console + public Calendar tab + .ics feed.
  revalidatePath('/spaces', 'layout')
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

/** Host approves a seat waiting in the approval queue. Re-checks event.editSettings (the admin
 *  client bypasses RLS, so this action is the authority).
 *
 *  Keyed on the RSVP ROW, not the profile: a signed-out guest has no profile id, so the old
 *  predicate matched nothing and this button did nothing for guest requests. */
export async function approveEventRsvp(
  eventId: string,
  slug: string,
  rsvpId: string,
): Promise<{ ok: true } | { error: string }> {
  const caps = await getEventCapabilities(eventId)
  if (!caps.has('event.editSettings')) return { error: 'Unauthorized' }

  await approveRsvpById(eventId, rsvpId)
  // Same notice as the Manage console's approve path — a host admitting someone from either
  // surface must produce the same outcome for the person waiting.
  await sendRsvpApprovedNotice(eventId, rsvpId).catch(() => {})

  revalidatePath(`/events/${slug}`)
  revalidatePath(`/events/${slug}/manage`)
  return { ok: true }
}

// ─── Engage (the 'engage' spine module) ────────────────────────────────────────
// Tickets, offerings, and check-in. A free RSVP event has no ticket price; adding one turns on
// paid tickets (events.price_cents). Sold-ticket + check-in counts are read for the summary.
// Read + write re-check event.editSettings.

/** Hydrate the in-rail Event settings stats box (event-settings-module) with the SAME
 *  core headline numbers the Manage dashboard shows — one shared read + shape
 *  (lib/events/event-stats). Resolves the event by slug, re-checks the host capability,
 *  and returns null on a miss so the rail simply hides the box (a hydration read like
 *  getEventAdminData, not a mutation, so it returns the value shape, not ActionResult). */
export async function getEventCoreStats(slug: string): Promise<EventCoreStats | null> {
  const admin = createAdminClient()
  const { data: ev } = await admin.from('events').select('id').eq('slug', slug).maybeSingle()
  if (!ev) return null

  const caps = await getEventCapabilities(ev.id)
  if (!caps.has('event.editSettings')) return null

  return loadEventCoreStats(ev.id)
}

