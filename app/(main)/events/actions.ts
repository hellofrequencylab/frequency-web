'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { slugify } from '@/lib/utils'
import { processGamificationEvent, recordStreakActivity } from '@/lib/achievements'
import { awardGems } from '@/lib/gems'
import { awardZapsForAction } from '@/lib/zaps'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { markVerifiedByAttendance } from '@/lib/verification/attendance'
import { generateOccurrencesForAnchor, type RecurrenceType } from '@/lib/event-recurrence'
import { validateRecurrenceUntil } from '@/lib/events/recurrence'
import { resolveRegionScopeId } from '@/lib/events/event-drafts'
import { cancelAudit } from '@/lib/events/event-lifecycle'
import { getCapacityInfo, promoteFromWaitlist } from '@/lib/events/capacity'
import { stampEventSpaceId } from '@/lib/events/store'
import { wallClockToIso, dateToWallClockIso } from '@/lib/events/datetime'
import { HOME_TZ, isValidTimeZone, isEventPast, zoneAbbrev, resolveZone } from '@/lib/time/zone'
import { embedEvent } from '@/lib/events/embeddings'
import { saveEventLocation, type AttendanceMode } from '@/lib/events/geocode'
import { nominatimGeocoder } from '@/lib/events/geocode-provider'
import { sendEventRsvpConfirmationEmail } from '@/lib/email'
import { shouldSend } from '@/lib/notification-preferences'
import { sendSms } from '@/lib/comms/sms'
import { recordContactInteraction } from '@/lib/crm/interactions'
import { buildGoogleCalendarUrl } from '@/components/events/add-to-calendar'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Gallery images ride as a JSON array of storage paths (the form has no native array
// shape). Parse defensively: a missing/garbage value, a non-array, or any non-string
// member yields a clean string[] (bad members dropped), capped so a crafted payload
// can't bloat the row. Empty array = clear the gallery.
const MAX_GALLERY_IMAGES = 12
function parseGalleryPaths(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      .map((p) => p.trim())
      .slice(0, MAX_GALLERY_IMAGES)
  } catch {
    return []
  }
}

// Venmo handle (shown next to the price until payments turn on): strip a leading @,
// keep Venmo's own charset, cap the length. Empty → null (clears the column on edit).
function parseVenmoHandle(raw: string | null): string | null {
  const cleaned = (raw ?? '').trim().replace(/^@/, '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 30)
  return cleaned || null
}

const VALID_RECURRENCE: RecurrenceType[] = ['none', 'daily', 'weekly', 'monthly']
const VALID_VISIBILITY = ['public', 'unlisted', 'circle_only', 'private']
const VALID_ENERGY = ['high_activation', 'grounding', 'social', 'ceremonial']
const VALID_ATTENDANCE: AttendanceMode[] = ['in_person', 'online', 'hybrid']

// Geocode-on-save (EVENTS-REWORK B1). Reads the structured address + attendance mode
// from the create form and hands them to the frozen saveEventLocation data layer
// with the keyless Nominatim provider. Best-effort by construction: a geocode miss
// (no/sparse address, online event, provider hiccup, rate-limit) just leaves geog
// NULL and the event still exists. Never throws into the create flow.
async function geocodeEventOnCreate(eventId: string, fd: FormData): Promise<void> {
  const str = (key: string): string | null => {
    const v = (fd.get(key) as string | null)?.trim()
    return v ? v : null
  }
  const modeRaw = (fd.get('attendanceMode') as string | null) ?? 'in_person'
  const attendanceMode: AttendanceMode = (VALID_ATTENDANCE as string[]).includes(modeRaw)
    ? (modeRaw as AttendanceMode)
    : 'in_person'

  try {
    await saveEventLocation(eventId, {
      address: {
        venueName: str('venueName'),
        street: str('street'),
        city: str('city'),
        region: str('region'),
        country: str('country'),
        postalCode: str('postalCode'),
        // Free-text fallback: geocode the one-line `location` (what most create paths set, incl.
        // Vera scans + the onboarding wizard) when no structured address was entered.
        query: str('location'),
      },
      attendanceMode,
      onlineUrl: str('onlineUrl'),
      geocoder: nominatimGeocoder,
    })
  } catch (e) {
    // saveEventLocation already swallows a geocode miss; this guards the
    // address-column write itself so the create flow never fails on location.
    console.error('[createEvent geocode]', e)
  }
}

// Returns ActionResult so the form can SHOW a failure (lib/action-result). Every
// guard used to be a silent `return`, which left the editor open with no message
// and nothing saved — indistinguishable from success. Navigation moved client-side
// (the form redirects to the returned slug on ok).
export async function createEvent(formData: FormData): Promise<ActionResult<{ slug: string }>> {
  const title = (formData.get('title') as string | null)?.trim()
  const description = (formData.get('description') as string | null)?.trim() || null
  const location = (formData.get('location') as string | null)?.trim() || null
  // Scope: a circle event belongs to one of the creator's circles; a PUBLIC event
  // (any Crew member, with or without a circle) is a standalone local event placed in
  // the creator's region (resolved below, like the poster-scan flow).
  const scopeType = (formData.get('scopeType') as string | null) === 'public' ? 'public' : 'circle'
  const isPublic = scopeType === 'public'
  const formScopeId = formData.get('scopeId') as string | null
  const startsAt = formData.get('startsAt') as string | null
  const endsAt = (formData.get('endsAt') as string | null) || null

  const recurrenceRaw = (formData.get('recurrenceType') as string | null) ?? 'none'
  const recurrenceType: RecurrenceType = (VALID_RECURRENCE as string[]).includes(recurrenceRaw)
    ? (recurrenceRaw as RecurrenceType)
    : 'none'
  const recurrenceUntilRaw = (formData.get('recurrenceUntil') as string | null) || null
  const recurrenceUntil = recurrenceType !== 'none' && recurrenceUntilRaw
    ? dateToWallClockIso(recurrenceUntilRaw)
    : null

  // P0 fields (additive). Capacity is the only real scarcity signal; visibility
  // defaults to circle_only to preserve the pre-P0 model.
  const capacityRaw = (formData.get('capacity') as string | null)?.trim() || ''
  const capacityParsed = capacityRaw ? parseInt(capacityRaw, 10) : NaN
  const capacity = Number.isFinite(capacityParsed) && capacityParsed > 0 ? capacityParsed : null

  const visibilityRaw = (formData.get('visibility') as string | null) || 'circle_only'
  let visibility = VALID_VISIBILITY.includes(visibilityRaw) ? visibilityRaw : 'circle_only'
  // A public (circle-less) event can't be circle_only — there is no circle to scope it to —
  // so fall it back to public.
  if (isPublic && visibility === 'circle_only') visibility = 'public'

  const category = (formData.get('category') as string | null)?.trim() || 'gathering'

  const energyRaw = (formData.get('energyTag') as string | null) || ''
  const energyTag = VALID_ENERGY.includes(energyRaw) ? energyRaw : null

  // Cover image (a storage path in the public event-media bucket, resolved to a URL at render).
  const coverImagePath = (formData.get('coverImagePath') as string | null)?.trim() || null
  // Additional gallery images (ordered storage paths in the same bucket).
  const galleryImagePaths = parseGalleryPaths(formData.get('galleryImagePaths') as string | null)
  // Unified gallery: the FIRST gallery image IS the header/cover. Lead the gallery with the cover and
  // set cover_image_path = gallery[0], so the editor + event-page invariant holds from creation.
  const galleryWithCover =
    coverImagePath && !galleryImagePaths.includes(coverImagePath)
      ? [coverImagePath, ...galleryImagePaths]
      : galleryImagePaths
  const headerCover = galleryWithCover[0] ?? null
  // Host's Venmo handle, shown next to the price while ticket sales are off.
  const venmoHandle = parseVenmoHandle(formData.get('venmoHandle') as string | null)

  // Event time zone (lib/time/zone): the venue's coordinates aren't known at insert (geocoding
  // runs async below), so seed the column with the creator's submitted zone when the form sends
  // one, else HOME_TZ. geocodeEventOnCreate then refines it from the resolved point (in-person),
  // so an in-person event ends up in its venue's zone and an online one keeps the creator's.
  const submittedTz = (formData.get('timeZone') as string | null)?.trim() || null
  const timeZone = isValidTimeZone(submittedTz) ? submittedTz : HOME_TZ

  if (!title || !startsAt) return fail('Give the event a title and a start time.')
  // A circle event must name a circle; a public event resolves its scope below.
  if (!isPublic && !formScopeId) return fail('Pick where this event lives.')
  // An end before the start is never valid — reject the bad write rather than store a
  // negative-duration event (the form should also block it, this is the server guard).
  if (endsAt && new Date(endsAt) < new Date(startsAt)) return fail('The end time must be after the start.')

  // UTC-naive: keep the picked wall-clock literally (lib/events/datetime), not tz-shifted.
  const startsIso = wallClockToIso(startsAt)
  const endsIso = endsAt ? wallClockToIso(endsAt) : null
  if (!startsIso) return fail('That start time did not read as a valid date.')

  // A repeat-end before the start would yield zero occurrences — reject rather than
  // store a dead series (the form blocks it too; this is the server guard).
  if (validateRecurrenceUntil(recurrenceType, startsIso, recurrenceUntil)) {
    return fail('The repeat end date must be after the start.')
  }

  const myProfileId = await getMyProfileId()
  if (!myProfileId) return fail('Sign in to create an event.')

  // Resolve the scope: a circle event uses the chosen circle; a public event is placed in
  // the creator's region (the same resolver the poster-scan flow uses).
  const scopeId = isPublic ? await resolveRegionScopeId(myProfileId) : formScopeId
  if (!scopeId) return fail('We could not place this event in your area. Please try again.')

  const admin = createAdminClient()

  // Unique slug generation
  const base = slugify(title) + '-' + startsAt.slice(0, 10)
  let slug = base
  const { data: existing } = await admin
    .from('events')
    .select('slug')
    .eq('slug', slug)
    .maybeSingle()
  if (existing) {
    slug = base + '-' + Math.random().toString(36).slice(2, 6)
  }

  const supabase = await createClient()
  // Stamp the owning Space (defaults to the root space, so this single-tenant flow keeps
  // behaving exactly as today).
  const spaceId = await stampEventSpaceId()
  // Cast: capacity/visibility/category/energy_tag/space_id are newer than the generated
  // DB types (lib/database.types.ts) — repo convention for not-yet-regenerated
  // columns (see lib/billing/*).
  const { data: inserted, error } = await (supabase)
    .from('events').insert({
      title,
      description,
      location,
      scope_id: scopeId,
      scope_type: scopeType,   // 'circle' (a circle's event) or 'public' (a standalone local event)
      starts_at: startsIso,
      ends_at: endsIso,
      host_id: myProfileId,
      slug,
      recurrence_type: recurrenceType,
      recurrence_until: recurrenceUntil,
      capacity,
      visibility,
      category,
      energy_tag: energyTag,
      cover_image_path: headerCover,
      gallery_image_paths: galleryWithCover,
      // venmo_handle is newer than the generated DB types → rides the payload cast below.
      venmo_handle: venmoHandle,
      // Event's IANA zone (newer than the generated DB types → cast). Refined from the geocoded
      // venue point in geocodeEventOnCreate; this seed keeps it non-null for online events too.
      time_zone: timeZone,
      // space_id is newer than the generated DB types — cast the payload to reach the column
      // (ADR-246); omit when the root row is missing (the backfill sweeps the NULL to root).
      ...(spaceId ? { space_id: spaceId } : {}),
    } as never).select('id').single()

  if (error || !inserted) {
    console.error('createEvent error', error)
    return fail('Could not create the event. Please try again.')
  }

  // Persist the structured address + geocode the venue to a map point (best-effort;
  // never blocks or fails the create). Awaited so the event lands on its page with
  // its address columns + geog already set.
  if (inserted) {
    await geocodeEventOnCreate(inserted.id, formData)
  }

  // For recurring events, materialise the first batch of occurrences right
  // away so users see them immediately (cron also runs daily as a backstop).
  if (recurrenceType !== 'none' && inserted) {
    generateOccurrencesForAnchor(inserted.id).catch((e) =>
      console.error('[createEvent] occurrence generation:', e)
    )
  }

  // Embed the event for the matching engine (fire-and-forget; no-ops if AI off).
  if (inserted) {
    embedEvent(inserted.id).catch((e) => console.error('[events embed]', e))
  }

  processGamificationEvent({ type: 'event_host', profileId: myProfileId }).catch((e) => console.error('[events gamification]', e))
  // Hosting an in-person gathering is external/organizing → zaps (not gems).
  awardZapsForAction(myProfileId, 'event_host').catch((e) => console.error('[events gamification]', e))
  recordStreakActivity(myProfileId, 'hosting').catch((e) => console.error('[events gamification]', e))

  // Creation token (Rewards Economy v3, ADR-305): creating an event is its first publish.
  // The host gets the small Gem token, idempotent per event id + best-effort (never blocks
  // the create). Fired only when the insert succeeded (inserted.id exists).
  if (inserted) {
    import('@/lib/rewards/creation')
      .then(({ awardCreationToken }) => awardCreationToken(myProfileId, 'event', inserted.id))
      .catch((e) => console.error('[events creation token]', e))
  }

  revalidatePath('/events')
  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
  // Navigation happens client-side off this result (a server redirect would
  // short-circuit returning the ActionResult).
  return ok({ slug })
}

// Edit an existing event's details (EVENTS host self-service). Gated by the same
// `event.editSettings` capability the admin editor + /manage use, so the host, a circle
// manager, OR a community admin can edit — re-checked server-side. The event's circle,
// host, and slug are NOT changed here (moving circles is a separate concern); everything
// else the create form sets is editable, including the recurrence cadence (changing it
// re-materialises the occurrence window; the daily cron is the backstop). The structured
// address re-geocodes on save (best-effort).
// Returns ActionResult so the editor can SHOW a failure (lib/action-result). Every guard
// (and the DB write error itself) used to be a silent `return`: the popup stayed open, the
// button flipped back to "Save changes", and nothing persisted — the "save ran but my
// content is gone" bug. Navigation moved client-side (the form redirects on ok).
export async function updateEvent(eventId: string, formData: FormData): Promise<ActionResult<{ slug: string }>> {
  const caps = await getEventCapabilities(eventId)
  if (!caps.has('event.editSettings')) return fail('You do not have permission to edit this event.')

  const title = (formData.get('title') as string | null)?.trim()
  const startsAt = formData.get('startsAt') as string | null
  if (!title || !startsAt) return fail('Give the event a title and a start time.')

  const description = (formData.get('description') as string | null)?.trim() || null
  const location = (formData.get('location') as string | null)?.trim() || null
  const endsAt = (formData.get('endsAt') as string | null) || null
  // Reject a negative-duration edit (the form blocks it too; this is the server guard).
  if (endsAt && new Date(endsAt) < new Date(startsAt)) return fail('The end time must be after the start.')

  // UTC-naive: keep the picked wall-clock literally (lib/events/datetime), not tz-shifted.
  const startsIso = wallClockToIso(startsAt)
  const endsIso = endsAt ? wallClockToIso(endsAt) : null
  if (!startsIso) return fail('That start time did not read as a valid date.')

  // Recurrence (additive, validated). Only an ANCHOR row (parent_event_id IS NULL) may
  // carry a cadence — a DB CHECK forbids a materialised occurrence from itself recurring,
  // so for a child occurrence we leave recurrence untouched (read below before persisting).
  const recurrenceRawEdit = (formData.get('recurrenceType') as string | null) ?? 'none'
  const recurrenceTypeEdit: RecurrenceType = (VALID_RECURRENCE as string[]).includes(recurrenceRawEdit)
    ? (recurrenceRawEdit as RecurrenceType)
    : 'none'
  const recurrenceUntilRawEdit = (formData.get('recurrenceUntil') as string | null) || null
  const recurrenceUntilEdit = recurrenceTypeEdit !== 'none' && recurrenceUntilRawEdit
    ? dateToWallClockIso(recurrenceUntilRawEdit)
    : null
  if (validateRecurrenceUntil(recurrenceTypeEdit, startsIso, recurrenceUntilEdit)) {
    return fail('The repeat end date must be after the start.')
  }

  const capacityRaw = (formData.get('capacity') as string | null)?.trim() || ''
  const capacityParsed = capacityRaw ? parseInt(capacityRaw, 10) : NaN
  const capacity = Number.isFinite(capacityParsed) && capacityParsed > 0 ? capacityParsed : null

  const visibilityRaw = (formData.get('visibility') as string | null) || 'circle_only'
  const visibility = VALID_VISIBILITY.includes(visibilityRaw) ? visibilityRaw : 'circle_only'
  const category = (formData.get('category') as string | null)?.trim() || 'gathering'
  const energyRaw = (formData.get('energyTag') as string | null) || ''
  const energyTag = VALID_ENERGY.includes(energyRaw) ? energyRaw : null
  const coverImagePath = (formData.get('coverImagePath') as string | null)?.trim() || null
  const galleryImagePaths = parseGalleryPaths(formData.get('galleryImagePaths') as string | null)
  // Unified gallery: the FIRST gallery image IS the header/cover. Lead the gallery with the cover and
  // set cover_image_path = gallery[0], so the editor + event-page invariant holds from creation.
  const galleryWithCover =
    coverImagePath && !galleryImagePaths.includes(coverImagePath)
      ? [coverImagePath, ...galleryImagePaths]
      : galleryImagePaths
  const headerCover = galleryWithCover[0] ?? null
  const venmoHandle = parseVenmoHandle(formData.get('venmoHandle') as string | null)

  const admin = createAdminClient()
  const { data: ev } = await admin
    .from('events')
    .select('slug, parent_event_id')
    .eq('id', eventId)
    .maybeSingle()
  const evRow = ev as { slug: string; parent_event_id: string | null } | null
  const slug = evRow?.slug
  if (!slug) return fail('This event could not be found.')
  // Recurrence is an anchor-only concern (a child occurrence cannot itself recur).
  const isAnchor = !evRow?.parent_event_id

  const { error } = await admin
    .from('events')
    .update({
      title,
      description,
      location,
      starts_at: startsIso,
      ends_at: endsIso,
      capacity,
      visibility,
      category,
      energy_tag: energyTag,
      cover_image_path: headerCover,
      gallery_image_paths: galleryWithCover,
      // venmo_handle is newer than the generated DB types → rides the payload cast below.
      venmo_handle: venmoHandle,
      // Only stamp recurrence on an anchor row; a child occurrence keeps recurrence_type 'none'.
      ...(isAnchor
        ? { recurrence_type: recurrenceTypeEdit, recurrence_until: recurrenceUntilEdit }
        : {}),
    } as never)
    .eq('id', eventId)
  if (error) {
    console.error('updateEvent error', error)
    return fail('Could not save your changes. Please try again.')
  }

  // If this anchor is (still) recurring, materialise the occurrence window for the
  // current cadence right away so the change shows immediately (the daily cron is the
  // backstop, and generateOccurrencesForAnchor is idempotent + dedupes by day).
  if (isAnchor && recurrenceTypeEdit !== 'none') {
    generateOccurrencesForAnchor(eventId).catch((e) =>
      console.error('[updateEvent] occurrence generation:', e),
    )
  }

  // Re-persist the structured address + re-geocode the venue (best-effort; never fails the save).
  await geocodeEventOnCreate(eventId, formData)
  // Re-embed for the matching engine (fire-and-forget; no-ops if AI off).
  embedEvent(eventId).catch((e) => console.error('[events embed]', e))

  revalidatePath('/events')
  revalidatePath(`/events/${slug}`)
  revalidatePath(`/events/${slug}/edit`)
  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
  // Navigation happens client-side off this result (a server redirect would
  // short-circuit returning the ActionResult).
  return ok({ slug })
}

// The "when" line for RSVP confirmations + reminders. starts_at stores the event's
// wall-clock as UTC PARTS, so we render those parts (timeZone:'UTC') to get the event's
// own local time, then label it with the event's REAL zone abbrev (PST/PDT/EST…) via
// lib/time/zone — not the literal "UTC" the old formatter printed. Reads identically to
// "Wed Jul 22 · 7:00 AM PDT".
function formatEventWhen(iso: string, tz: string = HOME_TZ): string {
  const base = new Date(iso)
    .toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      timeZone: 'UTC',
    })
    .replace(',', '')
    .replace(' at ', ' · ')
  const abbr = zoneAbbrev(iso, tz)
  return abbr ? `${base} ${abbr}` : base
}

// Best-effort, non-blocking RSVP confirmation email. Mirrors the reminder cron's
// send path exactly: events-category email preference gate (`shouldSend`) +
// suppression guard (inside sendRawEmail) + enqueueEmail outbox. Never throws into
// the RSVP action — any failure is swallowed and logged. Only called on a real
// transition into 'going'/'waitlist' (the action's own branches), so it can't
// double-send on a repeat toggle within the same status.
async function sendRsvpConfirmation(
  eventId: string,
  profileId: string,
  status: 'going' | 'waitlist',
): Promise<void> {
  const admin = createAdminClient()

  // time_zone is newer than the generated DB types, so selecting it yields a
  // SelectQueryError type — read untyped and cast to the shape we use (repo convention).
  const { data: evRaw } = await admin
    .from('events')
    .select('title, starts_at, ends_at, location, slug, description, scope_id, scope_type, is_cancelled, time_zone, host:profiles!host_id ( display_name )')
    .eq('id', eventId)
    .maybeSingle()
  const ev = evRaw as unknown as {
    title: string; starts_at: string; ends_at: string | null; location: string | null
    slug: string; description: string | null; scope_id: string | null; scope_type: string | null
    is_cancelled: boolean; time_zone: string | null; host: { display_name: string | null } | null
  } | null
  if (!ev || ev.is_cancelled) return
  const evTz = resolveZone(ev.time_zone)

  // The SMS leg is independent of the email leg (a member may want one and not the
  // other), so it runs in its own gated, self-contained try/catch below.
  void sendRsvpConfirmationSms(eventId, profileId, status, ev.title, ev.starts_at)

  try {
    if (!(await shouldSend(profileId, 'email', 'events'))) return

    const { data: profile } = await admin
      .from('profiles')
      .select('display_name, auth_user_id')
      .eq('id', profileId)
      .maybeSingle()
    if (!profile?.auth_user_id) return

    const { data: { user } } = await admin.auth.admin.getUserById(profile.auth_user_id)
    if (!user?.email) return

    let circleName: string | null = null
    if (ev.scope_type === 'circle' && ev.scope_id) {
      const { data: c } = await admin.from('circles').select('name').eq('id', ev.scope_id).maybeSingle()
      circleName = c?.name ?? null
    }

    const host = (ev as unknown as { host: { display_name: string | null } | null }).host
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
    const eventUrl = `${appUrl}/events/${ev.slug}`

    await sendEventRsvpConfirmationEmail({
      to:                 user.email,
      recipientName:      profile.display_name ?? 'there',
      recipientProfileId: profileId,
      eventTitle:         ev.title,
      whenAbsolute:       formatEventWhen(ev.starts_at, evTz),
      location:           ev.location,
      hostName:           host?.display_name ?? null,
      circleName,
      eventUrl,
      // Add-to-calendar reuses the same ICS route + Google URL builder the event
      // page uses; only sent for confirmed seats.
      icsUrl:             status === 'going' ? `${appUrl}/events/${ev.slug}/event.ics` : null,
      googleCalUrl:       status === 'going'
        ? buildGoogleCalendarUrl({
            title: ev.title, startsAt: ev.starts_at, endsAt: ev.ends_at,
            description: ev.description, location: ev.location, timeZone: evTz,
          })
        : null,
      status,
    })
  } catch (e) {
    console.error('[events rsvp confirmation email]', e)
  }
}

// Best-effort RSVP confirmation TEXT — the SMS sibling of the email leg above. Routes
// through sendSms, which enforces the FULL per-member gate (provisioning -> consent ->
// SMS prefs -> quiet hours), so it sends nothing until the A2P legal track is live AND
// the member opted in. Records an outbound 'sms' touch on the timeline only when the
// gate allowed the send. Never throws into the RSVP action. Carries sender identity +
// a STOP line (carrier requirement + the registered A2P samples).
async function sendRsvpConfirmationSms(
  eventId: string,
  profileId: string,
  status: 'going' | 'waitlist',
  eventTitle: string,
  startsAt: string,
): Promise<void> {
  try {
    const admin = createAdminClient()
    // home_timezone drives the quiet-hours check (cast: not in generated types yet).
    const { data: profile } = await admin
      .from('profiles')
      .select('home_timezone')
      .eq('id', profileId)
      .maybeSingle()
    const timeZone = (profile as { home_timezone?: string | null } | null)?.home_timezone ?? null

    const when = formatEventWhen(startsAt)
    const body =
      status === 'going'
        ? `Frequency: You're going to ${eventTitle} on ${when}. Reply STOP to opt out.`
        : `Frequency: You're on the waitlist for ${eventTitle} on ${when}. We'll text if a spot opens. Reply STOP to opt out.`

    const decision = await sendSms({ profileId, category: 'events', body, timeZone })
    if (decision.allowed) {
      await recordContactInteraction({
        ownerProfileId: profileId,
        subjectKind: 'profile',
        subjectId: profileId,
        channel: 'sms',
        direction: 'outbound',
        summary: body,
        source: 'engagement',
        metadata: { kind: 'event_rsvp_confirmation', event_id: eventId, status },
      })
    }
  } catch (e) {
    console.error('[events rsvp confirmation sms]', e)
  }
}

// Validated creation (Rewards Economy v3, ADR-305): an RSVP 'going' is the "use" that
// validates an event. The event's HOST (the beneficiary) is paid off the RSVPer's (the
// actor's) use when the RSVPer is an established member. Idempotent per event id + best-
// effort: pays the host exactly once across all attendees, never blocks the RSVP. Reads the
// host_id, then defers to the creation module (which runs the established-member gate).
async function fireEventValidation(eventId: string, rsvperId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data: ev } = await admin.from('events').select('host_id').eq('id', eventId).maybeSingle()
    const hostId = (ev as { host_id: string | null } | null)?.host_id
    if (!hostId) return
    const { awardValidatedCreation } = await import('@/lib/rewards/creation')
    await awardValidatedCreation(hostId, 'event', eventId, rsvperId)
  } catch (e) {
    console.error('[events creation validation]', e)
  }
}

// Re-read the PERSISTED RSVP status for a row after a write. The DB capacity trigger
// (enforce_event_rsvp_capacity, migration 20260610030000) silently coerces a 'going'
// write to 'waitlist' when the event is full, so the app's intended status can diverge
// from what actually landed. Side-effects (gems, host payout, confirmation + ICS) must
// branch on THIS value, never the intent — otherwise a demoted guest is paid + emailed
// as if confirmed. Best-effort: a read failure returns null so the caller falls back.
async function readRsvpStatus(eventId: string, profileId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('event_rsvps')
    .select('status')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .maybeSingle()
  return (data as { status: string } | null)?.status ?? null
}

// The event's host. Used to deny attendance gamification credit to the host of
// the event itself (anti-farming: no self-attendance rewards). Best-effort: a
// read failure returns null, so the caller treats it as "not the host" and the
// normal (other-attendee) reward path runs.
async function readEventHostId(eventId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('events').select('host_id').eq('id', eventId).maybeSingle()
  return (data as { host_id: string | null } | null)?.host_id ?? null
}

// Guard: the event must exist and not be cancelled before we write an RSVP row
// (mirrors checkInEvent's own check). Without it a stale/cancelled event id could
// mint orphaned RSVP rows + fire the going side-effects. Returns false to no-op.
async function eventOpenForRsvp(eventId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin.from('events').select('id, is_cancelled').eq('id', eventId).maybeSingle()
  return !!data && !(data as { is_cancelled: boolean | null }).is_cancelled
}

export async function toggleRSVP(eventId: string) {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return
  if (!(await eventOpenForRsvp(eventId))) return

  const admin = createAdminClient()
  const supabase = await createClient()

  const { data: existing } = await admin
    .from('event_rsvps')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('profile_id', myProfileId)
    .maybeSingle()

  // Side-effects for an intent-to-attend RSVP (only when truly 'going', never on
  // waitlist). Gems are the first-RSVP web reward; attendance zaps come at
  // check-in. We keep the streak/achievement tick that already lived here.
  const onGoing = (firstTime: boolean) => {
    if (firstTime) {
      // Attendance credit (achievement + streak + gem) is a FIRST-RSVP reward,
      // and never for your own event (anti-farming: a host can't farm attendance
      // by RSVPing to events they host, nor by un/re-RSVPing to repeat the tick).
      void (async () => {
        const isOwnEvent = (await readEventHostId(eventId)) === myProfileId
        if (isOwnEvent) return
        processGamificationEvent({ type: 'event_attend', profileId: myProfileId }).catch((e) => console.error('[events gamification]', e))
        recordStreakActivity(myProfileId, 'attendance').catch((e) => console.error('[events gamification]', e))
        // One row per (event, profile); the gem fires once on the first RSVP.
        awardGems(myProfileId, 'event_rsvp').catch((e) => console.error('[events gamification]', e))
      })()
    }
    // Validated creation pays the host (idempotent per event, so any 'going' is safe).
    fireEventValidation(eventId, myProfileId).catch((e) => console.error('[events creation validation]', e))
  }

  if (existing) {
    if (existing.status === 'going' || existing.status === 'waitlist') {
      // Withdraw. If we freed a confirmed seat, pull the next person off the
      // waitlist (warm proof of momentum, never fake scarcity).
      await supabase.from('event_rsvps').update({ status: 'not_going' }).eq('id', existing.id)
      if (existing.status === 'going') {
        await promoteFromWaitlist(eventId).catch((e) => { console.error('[events waitlist]', e); return null })
      }
    } else {
      // Re-join: honour real capacity — waitlist only when genuinely full.
      const { isFull } = await getCapacityInfo(eventId)
      const next = isFull ? 'waitlist' : 'going'
      await supabase.from('event_rsvps').update({ status: next }).eq('id', existing.id)
      // The capacity trigger has the final say (a concurrent fill demotes 'going' →
      // 'waitlist'), so branch the side-effects on the PERSISTED status, not the
      // app's intent — otherwise a waitlisted guest gets gems / a host payout / a
      // "you're going" confirmation they shouldn't.
      const stored = await readRsvpStatus(eventId, myProfileId)
      // On a read failure (null) fall back to the intent; otherwise trust the row.
      const effective: 'going' | 'waitlist' = (stored ?? next) === 'going' ? 'going' : 'waitlist'
      if (effective === 'going') onGoing(false)
      // Fire-and-forget confirmation — never blocks/breaks the RSVP (best-effort,
      // self-contained try-catch + pref/suppression gating inside the helper).
      sendRsvpConfirmation(eventId, myProfileId, effective).catch((e) =>
        console.error('[events rsvp confirmation email]', e)
      )
    }
  } else {
    const { isFull } = await getCapacityInfo(eventId)
    const next = isFull ? 'waitlist' : 'going'
    await supabase.from('event_rsvps').insert({
      event_id: eventId,
      profile_id: myProfileId,
      status: next,
    })
    // Branch on the PERSISTED status (the trigger may demote to waitlist), not intent.
    const stored = await readRsvpStatus(eventId, myProfileId)
    const effective: 'going' | 'waitlist' = (stored ?? next) === 'going' ? 'going' : 'waitlist'
    if (effective === 'going') onGoing(true)
    sendRsvpConfirmation(eventId, myProfileId, effective).catch((e) =>
      console.error('[events rsvp confirmation email]', e)
    )
  }

  revalidatePath('/events', 'layout')
  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
}

// Explicit RSVP intent (going / maybe / not_going). Unlike `toggleRSVP` (which
// flips between attend/withdraw), this lets a member move directly between the
// three states the RSVP control offers — Going, Interested (maybe), and Can't go.
// This is the FREE-event / RSVP path — entirely independent of the ticket branch
// (a priced event with a payouts-ready host renders TicketButton instead). A free
// event never routes through Stripe; the member just lands in `event_rsvps` here.
// Self-authorized: only ever touches the caller's own RSVP row.
//
//   • 'going'      → honours real capacity (full ⇒ 'waitlist'); fires the
//                    confirmation email + the going side-effects, exactly like
//                    toggleRSVP. Never double-sends within the same status.
//   • 'maybe'      → soft interest. Does NOT consume capacity and NEVER emails.
//                    If the member was holding a confirmed seat, leaving it frees
//                    it, so we promote the next person off the waitlist.
//   • 'not_going'  → withdraw. Frees a seat + promotes from waitlist if needed.
//
// `opts.slug` (when the caller knows it — the detail control passes it) revalidates
// the specific /events/[slug] page so the RSVP reflects immediately, not only via
// the broader /events layout sweep.
export async function setRsvpStatus(
  eventId: string,
  intent: 'going' | 'maybe' | 'not_going',
  opts?: { slug?: string },
) {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return
  if (!(await eventOpenForRsvp(eventId))) return

  const admin = createAdminClient()
  const supabase = await createClient()

  const { data: existing } = await admin
    .from('event_rsvps')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('profile_id', myProfileId)
    .maybeSingle()

  const prevStatus = existing?.status ?? 'not_going'
  // A confirmed seat is freed when we move OUT of 'going' (to maybe/not_going).
  const heldSeat = prevStatus === 'going'

  // Side-effects for a true intent-to-attend (mirrors toggleRSVP's onGoing).
  const onGoing = (firstTime: boolean) => {
    if (firstTime) {
      // Attendance credit (achievement + streak + gem) is a FIRST-RSVP reward,
      // and never for your own event (anti-farming: a host can't farm attendance
      // by RSVPing to events they host, nor by un/re-RSVPing to repeat the tick).
      void (async () => {
        const isOwnEvent = (await readEventHostId(eventId)) === myProfileId
        if (isOwnEvent) return
        processGamificationEvent({ type: 'event_attend', profileId: myProfileId }).catch((e) => console.error('[events gamification]', e))
        recordStreakActivity(myProfileId, 'attendance').catch((e) => console.error('[events gamification]', e))
        awardGems(myProfileId, 'event_rsvp').catch((e) => console.error('[events gamification]', e))
      })()
    }
    // Validated creation pays the host (idempotent per event, so any 'going' is safe).
    fireEventValidation(eventId, myProfileId).catch((e) => console.error('[events creation validation]', e))
  }

  if (intent === 'going') {
    // No-op if already confirmed (going/waitlist) — avoids a redundant email.
    if (prevStatus !== 'going' && prevStatus !== 'waitlist') {
      const { isFull } = await getCapacityInfo(eventId)
      const next = isFull ? 'waitlist' : 'going'
      if (existing) {
        await supabase.from('event_rsvps').update({ status: next }).eq('id', existing.id)
      } else {
        await supabase.from('event_rsvps').insert({
          event_id: eventId,
          profile_id: myProfileId,
          status: next,
        })
      }
      // Branch the side-effects on the PERSISTED status: the capacity trigger may have
      // demoted this 'going' write to 'waitlist', and a waitlisted guest must not get
      // the gems / host payout / "you're going" confirmation. Fall back to intent on a
      // read failure.
      const stored = await readRsvpStatus(eventId, myProfileId)
      const effective: 'going' | 'waitlist' = (stored ?? next) === 'going' ? 'going' : 'waitlist'
      if (effective === 'going') onGoing(!existing)
      sendRsvpConfirmation(eventId, myProfileId, effective).catch((e) =>
        console.error('[events rsvp confirmation email]', e)
      )
    }
  } else {
    // maybe / not_going: a soft state, no email, no capacity consumed.
    // `plus_ones` isn't in the generated DB types yet → untyped cast (repo
    // convention for not-yet-regenerated columns; see lib/events/capacity.ts).
    const db = supabase
    if (existing) {
      if (existing.status !== intent) {
        // plus_ones only mean anything for a confirmed seat — clear on stepping back.
        await db
          .from('event_rsvps')
          .update({ status: intent, plus_ones: 0 })
          .eq('id', existing.id)
      }
    } else {
      await db.from('event_rsvps').insert({
        event_id: eventId,
        profile_id: myProfileId,
        status: intent,
        plus_ones: 0,
      })
    }
    // Freed a confirmed seat → pull the next person off the waitlist.
    if (heldSeat) {
      await promoteFromWaitlist(eventId).catch((e) => { console.error('[events waitlist]', e); return null })
    }
  }

  revalidatePath('/events', 'layout')
  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
  // Reflect the change on the event's own detail page right away when we know its slug.
  if (opts?.slug) revalidatePath(`/events/${opts.slug}`)
}

// Capacity-neutral headcount the host cares about: how many guests a confirmed
// attendee is bringing. Self-authorized (only the caller's own row), clamped to
// [0, MAX_PLUS_ONES], and only meaningful for a 'going' RSVP — we no-op otherwise
// so it can't inflate a maybe/waitlist row. Does NOT consume seats (the capacity
// trigger counts 'going' rows, not plus_ones) and never emails.
const MAX_PLUS_ONES = 5

export async function setRsvpPlusOnes(eventId: string, plusOnes: number) {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return

  const n = Number.isFinite(plusOnes) ? Math.max(0, Math.min(MAX_PLUS_ONES, Math.trunc(plusOnes))) : 0

  const admin = createAdminClient()
  const supabase = await createClient()

  const { data: existing } = await admin
    .from('event_rsvps')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('profile_id', myProfileId)
    .maybeSingle()

  // Only a confirmed attendee can bring guests — guard rather than create rows.
  if (!existing || existing.status !== 'going') return

  // `plus_ones` isn't in the generated DB types yet → untyped cast (repo
  // convention for not-yet-regenerated columns; see lib/events/capacity.ts).
  await (supabase)
    .from('event_rsvps')
    .update({ plus_ones: n })
    .eq('id', existing.id)

  revalidatePath('/events', 'layout')
  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
}

export interface CheckInResult {
  ok: boolean
  alreadyCheckedIn?: boolean
  zapsAwarded?: number
}

// Verified-practice check-in (the North-Star `practice.verified` event). Server-
// authoritative: the event must be real, started, not cancelled, and the viewer
// must have RSVP'd 'going'. Idempotent per (event, profile); the first check-in
// records the ledger event, awards zaps, and ticks the attendance streak.
// (RSVP = gems web-action; check-in = zaps verified practice; see ADR-021/024.)
export async function checkInEvent(eventId: string): Promise<CheckInResult> {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return { ok: false }

  const admin = createAdminClient()
  // time_zone is newer than the generated DB types, so a plain typed select of it yields a
  // SelectQueryError type — read the row untyped and cast (repo convention). The column is
  // still returned at runtime.
  const { data: evRaw } = await admin
    .from('events')
    .select('starts_at, is_cancelled, time_zone')
    .eq('id', eventId)
    .maybeSingle()
  const ev = evRaw as unknown as { starts_at: string; is_cancelled: boolean; time_zone: string | null } | null
  // Check-in unlocks only once the event has actually STARTED in its own zone. Comparing
  // the raw wall-clock to now unlocked it (and awarded Zaps) ~7h early for a PT event.
  const evCheckInTz = resolveZone(ev?.time_zone)
  if (!ev || ev.is_cancelled || !isEventPast(ev.starts_at, null, evCheckInTz)) return { ok: false }

  const { data: rsvp } = await admin
    .from('event_rsvps')
    .select('status')
    .eq('event_id', eventId)
    .eq('profile_id', myProfileId)
    .maybeSingle()
  if (rsvp?.status !== 'going') return { ok: false }

  // "Showed up" verification (ADR-420): physically checking in at a real event is the
  // baseline real-person signal. Idempotent (only sets verified_at once) + fail-safe.
  // Runs for any valid check-in, so a member already counted as attending still verifies.
  await markVerifiedByAttendance(myProfileId)

  const { recorded } = await recordEngagementEvent({
    idempotencyKey: `event_checkin:${eventId}:${myProfileId}`,
    source: 'web',
    eventType: 'practice.verified',
    actorProfileId: myProfileId,
    context: { eventId, kind: 'event_checkin' },
    verifiedAt: new Date(),
  })
  if (!recorded) return { ok: true, alreadyCheckedIn: true }

  // Verified practice always earns zaps (regardless of channel) + a streak tick.
  let zapsAwarded = 0
  try {
    zapsAwarded = (await awardZapsForAction(myProfileId, 'event_attend')).amount
  } catch {
    // never let a reward read break the check-in
  }
  await recordStreakActivity(myProfileId, 'attendance').catch((e) => console.error('[events gamification]', e))
  // A first check-in changes the event's going/check-in counts the detail + manage
  // pages render, so refresh them (the 'going' branches already revalidate; this path didn't).
  revalidatePath('/events', 'layout')
  return { ok: true, zapsAwarded }
}

export async function cancelEvent(eventId: string) {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return

  const supabase = await createClient()
  await supabase
    .from('events')
    .update(cancelAudit(myProfileId, null))
    .eq('id', eventId)
    .eq('host_id', myProfileId)

  revalidatePath('/events')
  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
}
