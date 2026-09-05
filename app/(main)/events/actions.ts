'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getEventCapabilities, getCircleCapabilities } from '@/lib/core/load-capabilities'
import { memberWithinLeadershipAllowance, EVENT_CREATE_CAP_MESSAGE } from '@/lib/pricing/member-leadership'
import { isUpcomingByInstant, MAX_TZ_OFFSET_MS } from '@/lib/pricing/member-meter-usage'
import type { EntitlementTier } from '@/lib/core/entitlement'
import { slugify } from '@/lib/utils'
import { processGamificationEvent, recordStreakActivity } from '@/lib/achievements'
import { awardGems } from '@/lib/gems'
import { awardZapsForAction } from '@/lib/zaps'
import { recordEngagementEvent } from '@/lib/engagement/events'
import { markVerifiedByAttendance } from '@/lib/verification/attendance'
import { propagateAnchorEditsToOccurrences, generateOccurrencesForAnchor, type RecurrenceType } from '@/lib/event-recurrence'
import { validateRecurrenceUntil } from '@/lib/events/recurrence'
import { resolveRegionScopeId } from '@/lib/events/event-drafts'
import { listSpaceEventCreatorIds, journeyLinkPatch } from '@/lib/events/placement'
import { canEditJourney } from '@/lib/journeys/authoring'
import { cancelAudit } from '@/lib/events/event-lifecycle'
import { refundAndNotifyForCancelledEvent } from '@/lib/events/cancellation'
import { getCapacityInfo, promoteFromWaitlist } from '@/lib/events/capacity'
import { notifyPromotedSeat } from '@/lib/events/waitlist-notify'
import { stampEventSpaceId } from '@/lib/events/store'
import { spaceIdForCircle } from '@/lib/circles/store'
import { wallClockToIso, dateToWallClockIso } from '@/lib/events/datetime'
import { coerceVisibilityForScope } from '@/lib/events/options'
import { HOME_TZ, isValidTimeZone, isEventPast, zoneAbbrev, resolveZone } from '@/lib/time/zone'
import { readEventCheckInEnabled } from '@/lib/events/checkin-enabled'
import { checkInWindowOpen } from '@/lib/events/checkin-window'
import { isPendingApproval } from '@/lib/events/admission'
import { rsvpWindowStateFromDetails } from '@/lib/events/rsvp-window'
import { embedEvent } from '@/lib/events/embeddings'
import { saveEventLocation, type AttendanceMode } from '@/lib/events/geocode'
import { nominatimGeocoder } from '@/lib/events/geocode-provider'
import { sendEventRsvpConfirmationEmail } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { sendSms } from '@/lib/comms/sms'
import { recordContactInteraction } from '@/lib/crm/interactions'
import { captureEventLead } from '@/lib/crm/lead-capture'
import { rewardConnectorAttendanceForCheckin } from '@/lib/rewards/connector'
import { buildGoogleCalendarUrl } from '@/components/events/add-to-calendar'
import { draftEventSpark } from '@/lib/ai/events-ai'
import { EVENT_MANIFEST } from '@/lib/studio/entities/event'
import { normalizeSeedMood } from '@/lib/studio/kernel/moods'
import {
  applyLock,
  declaredLockKeys,
  displayRecord,
  redrawBrief,
  settleRedraw,
  type FieldChange,
} from '@/lib/studio/kernel/redraw'
import { saveSteer } from '@/lib/studio/steer-store'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { resolveHostingSpaceIdFromRow } from '@/lib/events/host-space'

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

// Ticket price from the form: whole cents as a string. Blank / non-positive / garbage → null
// (a free RSVP event). Kept as cents end-to-end so no float rounding creeps into the column.
function parsePriceCents(raw: string | null): number | null {
  const n = raw ? parseInt(raw.trim(), 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

// THE JOURNEY LINK (events.journey_id). An ASSOCIATION, like space_id — not a placement. Attaching
// or detaching a Journey never moves the event: its home stays the bare scope_id + scope_type pair,
// so a Circle's event stays on its Circle and a public event stays in its region. The one column
// this writes comes from journeyLinkPatch (lib/events/placement.ts), never a hand-rolled set.
//
// Three outcomes, and the first one matters as much as the others: a form that does not SEND
// `journeyId` leaves the existing link alone. The event editor is not the only writer of an event
// (the draft publish path, Vera's spark, the poster scanner), and a patch built from "the field is
// absent" rather than "the field is empty" is what keeps one of those from silently un-linking an
// event it never knew was part of a Journey. Blank means detach; only a real id attaches.
//
// AUTHORITY is `canEditJourney` — the ONE Journey gate (author, platform operator, or a manager of
// the owning Space), the same rule the Journey editor route and every Journey editor action ask.
// The picker offers exactly what this admits (ADR-883 §3: the offer and the gate are one rule), and
// this re-derives it server-side because the client's list is a convenience, never an authority.
// Detaching needs no Journey authority: the caller already had to hold event.editSettings to get
// here, and taking your own event back out of someone's Journey is their business, not the
// Journey author's.
type JourneyLink = { ok: true; patch: Record<string, unknown> } | { ok: false; message: string }
const NO_JOURNEY_CHANGE: JourneyLink = { ok: true, patch: {} }

async function resolveJourneyLink(formData: FormData, profileId: string | null): Promise<JourneyLink> {
  const raw = formData.get('journeyId')
  if (raw === null) return NO_JOURNEY_CHANGE
  const journeyId = typeof raw === 'string' ? raw.trim() : ''
  if (!journeyId) return { ok: true, patch: journeyLinkPatch(null) }
  if (!(await canEditJourney(journeyId, profileId))) {
    return { ok: false, message: 'You can only add an event to a Journey you run.' }
  }
  return { ok: true, patch: journeyLinkPatch(journeyId) }
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

  // Explicit pin from the editor's draggable marker. When the host has placed it themselves,
  // that point is the truth: saveEventLocation persists it via the explicitPoint path and skips
  // the geocoder entirely. A missing/invalid pin (null) falls back to the address geocode below.
  const latRaw = fd.get('venueLat')
  const lngRaw = fd.get('venueLng')
  const lat = typeof latRaw === 'string' ? Number(latRaw) : NaN
  const lng = typeof lngRaw === 'string' ? Number(lngRaw) : NaN
  const point =
    Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
      ? { lat, lng }
      : null

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
      // A dragged/picked pin wins over the address geocode (geocode.ts explicitPoint path).
      point,
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
// ── SETTING A PRICE IS NOT GATED (ADR-914, reversing ADR-913) ──────────────────────────────────
//
// A `priceRefusal` helper used to sit here and block a free Member from writing a price at all. It is
// gone: selling is free on every tier, and the ladder is the RATE, not the permission
// (docs/VALUE-LADDER.md §1). Writing a price is now always allowed.
//
// What replaced it is not a check on this path at all. The one remaining condition — the payee has a
// Stripe account that can actually receive money — is surfaced as a SETUP STEP next to the price
// control, and enforced once, at the buy path (lib/billing/tickets.ts), which is the only place that
// sees every sale. Refusing the WRITE would have been actively wrong here: someone should be able to
// price their event and connect their bank in either order.

/**
 * The personal `event_create` allowance check (ADR-908). Counts the member's UPCOMING personal
 * events (host_id = them, no Space placement) against their tier's allowance.
 *
 * FAIL-SAFE to allowed in every failure path: a count we cannot complete, or a profile we cannot
 * read, must never stop someone putting a gathering on the calendar.
 */
async function memberEventAllowanceOk(
  profileId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const admin = createAdminClient()
    const { data: p } = await admin
      .from('profiles')
      .select('membership_tier')
      .eq('id', profileId)
      .maybeSingle()
    const tier = ((p as { membership_tier: string | null } | null)?.membership_tier ??
      'free') as EntitlementTier
    // 2026-09-05 (scan2 L6-14, ADR-1211): starts_at is the event's wall clock stored in UTC parts, so a raw
    // comparison against now() dropped a Los Angeles evening event from the allowance at noon local and kept
    // a Sydney morning event until the evening. Read a band widened by the largest zone offset and count by
    // the real instant, the way the reminder crons already do.
    const { data: upcomingRows } = await admin
      .from('events')
      .select('starts_at, time_zone')
      .eq('host_id', profileId)
      .is('space_id', null)
      .gte('starts_at', new Date(Date.now() - MAX_TZ_OFFSET_MS).toISOString())
    const count = ((upcomingRows ?? []) as { starts_at: string; time_zone: string | null }[]).filter((r) =>
      isUpcomingByInstant(r),
    ).length
    if (await memberWithinLeadershipAllowance('event_create', tier, count)) return { ok: true }
    return { ok: false, message: EVENT_CREATE_CAP_MESSAGE }
  } catch {
    return { ok: true }
  }
}

export async function createEvent(formData: FormData): Promise<ActionResult<{ slug: string }>> {
  const title = (formData.get('title') as string | null)?.trim()
  const description = (formData.get('description') as string | null)?.trim() || null
  const location = (formData.get('location') as string | null)?.trim() || null
  // WHERE DOES IT LIVE. Three shapes:
  //   • 'public' — a standalone local event placed in the creator's region (resolved below).
  //   • 'circle' — belongs to a circle the creator HOSTS (scope_id = circle, scope_type='circle').
  //   • 'space'  — lives under a space the creator RUNS: region-scoped like a public event, plus
  //                events.space_id = the space (that column is the "lives under this Space" placement,
  //                and 'space' is not a valid scope_type, so the base scope_type stays 'public').
  const scopeRaw = (formData.get('scopeType') as string | null) ?? 'public'
  const scopeChoice: 'public' | 'circle' | 'space' =
    scopeRaw === 'circle' ? 'circle' : scopeRaw === 'space' ? 'space' : 'public'
  const isPublic = scopeChoice === 'public'
  // The scope_type COLUMN only ever holds 'circle' or 'public' (a space event is 'public' + space_id).
  const scopeType = scopeChoice === 'circle' ? 'circle' : 'public'
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
  // Only a circle event has a circle to scope to — a public OR space event can't be circle_only.
  // Step DOWN to unlisted, never up to public (ADR-883: a host who picked the narrow option
  // never gets broadcast instead). Same rule as updateEvent, via the one shared helper.
  visibility = coerceVisibilityForScope(visibility, scopeType)

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
  // Ticket price in cents (blank = a free RSVP event).
  const priceCents = parsePriceCents(formData.get('priceCents') as string | null)

  // Special instructions (parking, what to bring, door code, accessibility). Stored in the
  // events.details JSONB under `specialInstructions` — no new column/migration. A fresh manual
  // event has no other details, so this is the only key we set here. Blank = leave details as-is.
  const specialInstructions = (formData.get('specialInstructions') as string | null)?.trim() || null

  // Event time zone (lib/time/zone): the venue's coordinates aren't known at insert (geocoding
  // runs async below), so seed the column with the creator's submitted zone when the form sends
  // one, else HOME_TZ. geocodeEventOnCreate then refines it from the resolved point (in-person),
  // so an in-person event ends up in its venue's zone and an online one keeps the creator's.
  const submittedTz = (formData.get('timeZone') as string | null)?.trim() || null
  const timeZone = isValidTimeZone(submittedTz) ? submittedTz : HOME_TZ

  if (!title || !startsAt) return fail('Give the event a title and a start time.')
  // A circle or space event must name its target; a public event resolves its scope below.
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

  // FIRST ONE FREE (ADR-908): a free Member runs the couple of events their membership includes;
  // Crew runs unlimited. Scoped to PERSONAL events (not a 'space' placement) because an event under
  // a Space is the Space plan's business, not the personal ladder. Counts only UPCOMING events, so
  // the allowance is about what you are actually running, and past events never accumulate into a
  // wall. 🔴 Inert until the gates go live, and fail-safe to allowed.
  if (scopeChoice !== 'space') {
    const capacityCheck = await memberEventAllowanceOk(myProfileId)
    if (!capacityCheck.ok) return fail(capacityCheck.message)
  }

  // AUTHZ RE-VALIDATION — the single most important guard here. The form only OFFERS circles the
  // caller hosts and spaces they run, but an attacker can POST any id. Because an owned target
  // places INSTANTLY (no steward approval step), the server must be the authority: re-derive the
  // steward set for the chosen target and FAIL CLOSED unless the caller is in it. Never trust the
  // client's scope list. `space_id` for a space event is set below (that column = instant placement).
  let spaceIdForPlacement: string | null = null
  if (scopeChoice === 'circle') {
    // The circle has to EXIST before its authority is asked for: a staff viewer resolves
    // circle.editSettings on any circle id, including one that names no row, and `scope_id` has no
    // foreign key to catch it. Fail closed on a target that is not there.
    const { data: targetCircle } = await createAdminClient()
      .from('circles')
      .select('id')
      .eq('id', formScopeId as string)
      .neq('status', 'archived')
      .maybeSingle()
    if (!targetCircle) return fail('That Circle could not be found.')
    // ONE circle authority: `circle.editSettings` — its host (by FK or stewardship edge), platform
    // staff, or the guide/mentor over its hub/nexus. The old check read circles.host_id alone, so
    // someone who runs the Circle everywhere else (and may even APPROVE another host's placement
    // into it, viewerIsSteward in placement-actions.ts) could not create its events. Same rule on
    // both sides now. "If you run the scope, you run its events."
    const circleCaps = await getCircleCapabilities(formScopeId as string)
    if (!circleCaps.has('circle.editSettings')) {
      return fail('You can only add an event to a Circle you run.')
    }
    // A circle's events belong to the circle's Space too (ADR-857): derive the placement from
    // the circle so the event lands on BOTH the circle page (scope_id) and the Space calendar
    // (space_id). A personal circle derives the root space — exactly today's behaviour.
    spaceIdForPlacement = await spaceIdForCircle(formScopeId as string)
  } else if (scopeChoice === 'space') {
    // Editor+ managers create under the space (the Calendar console admits editors); the narrower
    // admin-only steward set stays the approval authority for external placement requests.
    const creators = await listSpaceEventCreatorIds(formScopeId as string)
    if (!creators.includes(myProfileId)) {
      return fail('You can only add an event to a space you help run.')
    }
    spaceIdForPlacement = formScopeId
  }

  // The Journey this event is part of, if any — resolved and AUTHORIZED before the insert, so a
  // link the caller may not make fails the create outright instead of leaving a created event with
  // a silently dropped association (the failure mode ADR-883 catalogued for the circle path).
  const journeyLink = await resolveJourneyLink(formData, myProfileId)
  if (!journeyLink.ok) return fail(journeyLink.message)

  // Resolve the base scope_id column: a circle event uses the chosen circle; a public OR space
  // event is region-scoped (a space event additionally carries space_id, set at insert below).
  const scopeId = scopeChoice === 'circle' ? formScopeId : await resolveRegionScopeId(myProfileId)
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

  // Stamp the owning Space. A 'space' scope stamps the CHOSEN space (already ownership-checked
  // above, so it goes live there instantly); every other flow defaults to the root space, so the
  // single-tenant path keeps behaving exactly as today.
  const spaceId = await stampEventSpaceId(spaceIdForPlacement)
  // Cast: capacity/visibility/category/energy_tag/space_id are newer than the generated
  // DB types (lib/database.types.ts) — repo convention for not-yet-regenerated
  // columns (see lib/billing/*).
  //
  // 🔴 THE INSERT RUNS ON THE ADMIN CLIENT, ON PURPOSE. This write used to go through the SESSION
  // client, and live RLS on `events` carries a policy PAIR that no ordinary caller can satisfy:
  //   • PERMISSIVE  `get_my_role() >= 'host' AND host_id = me`  — every `member` profile fails it;
  //   • RESTRICTIVE `events_space_writable_ins` = `private.can_write_space_content(space_id)` — the
  //     root arm of that helper is staff-only, and `stampEventSpaceId` stamps the ROOT space for
  //     every non-Space create above, so every `host` profile fails it too.
  // Only platform staff could create an event from /events/new; everyone else got "Could not
  // create the event" from a page that says creation is open to any signed-in member. The
  // sibling create paths (lib/circles/events.ts, lib/journeys/runs.ts,
  // app/(main)/admin/events/actions.ts) already write through the admin client for the same
  // reason. The authority is the app-level checks above, not the row policy: `host_id` is the
  // VERIFIED caller (getMyProfileId), `space_id` / `host_space_id` come from the re-derived
  // ownership (circle.editSettings / listSpaceEventCreatorIds), `scope_id` from the caller's own
  // region, and the Journey link is authorized before we get here. Nothing in this payload is
  // taken from the form as an identity, so the service role widens nothing a caller can write.
  const { data: inserted, error } = await admin
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
      // Ticket price (null = free RSVP event). Setting it turns the event into a paid-ticket event.
      price_cents: priceCents,
      // Event's IANA zone (newer than the generated DB types → cast). Refined from the geocoded
      // venue point in geocodeEventOnCreate; this seed keeps it non-null for online events too.
      time_zone: timeZone,
      // Practical host notes, folded into the details JSONB (only when provided).
      ...(specialInstructions ? { details: { specialInstructions } } : {}),
      // space_id is newer than the generated DB types — cast the payload to reach the column
      // (ADR-246); omit when the root row is missing (the backfill sweeps the NULL to root).
      ...(spaceId ? { space_id: spaceId } : {}),
      // HOSTING ENTITY: an event created under a space is HOSTED by that space (billed + displayed
      // host; registrations and ticket money route through it). host_id stays the personal operator
      // axis (edit rights, notifications). Distinct from space_id, which is pure tenancy/placement.
      ...(scopeChoice === 'space' && spaceIdForPlacement ? { host_space_id: spaceIdForPlacement } : {}),
      // The Journey association (journey_id), authorized above. Empty when the form sent no link,
      // so this is the only place the column is touched on create and it can never carry a scope.
      ...journeyLink.patch,
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
  // A space event surfaces on its Space's Calendar console, public Calendar tab, and .ics
  // feed — refresh those too so a create/edit/cancel/delete shows up there without a wait.
  revalidatePath('/spaces', 'layout')
  // A linked event shows on its Journey, so refresh that tree when the link was touched.
  if (Object.keys(journeyLink.patch).length > 0) revalidatePath('/journeys', 'layout')
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
  // Validated here, COERCED below once the row's scope_type is in hand: circle_only on a
  // non-circle scope steps down to unlisted (ADR-883), exactly like createEvent. Without the
  // coercion an edit that picked "My circle" on a public-scoped event made it readable by its
  // host alone (the RLS circle_only branch only matches circle scopes) while staying link-open.
  const visibilityRequested = VALID_VISIBILITY.includes(visibilityRaw) ? visibilityRaw : 'circle_only'
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
  // Price: the edit form always sends `priceCents` (the cents for a paid event, or '0' for Free,
  // which parsePriceCents turns into null so the price is cleared). We still guard on the field
  // being present so any other caller that omits it leaves price_cents untouched rather than wiping it.
  const priceFieldSent = formData.get('priceCents') !== null
  const priceCents = priceFieldSent ? parsePriceCents(formData.get('priceCents') as string | null) : null

  // Special instructions: only sent when non-empty (a blank edit never wipes a stored note,
  // mirroring the price field). When present, MERGE into the existing details JSONB so Vera's
  // structured harvest (lineup / schedule / tickets / links) survives an edit untouched.
  const siRaw = formData.get('specialInstructions')
  const specialInstructions = typeof siRaw === 'string' ? siRaw.trim() : null

  // Attach / detach the Journey (events.journey_id). Absent field = leave the link alone; blank =
  // detach; an id = attach, gated on the one Journey authority. Resolved BEFORE the write so a
  // rejected link fails the whole save rather than persisting the other edits without it.
  const journeyLink = await resolveJourneyLink(formData, await getMyProfileId())
  if (!journeyLink.ok) return fail(journeyLink.message)

  const admin = createAdminClient()
  const { data: ev } = await admin
    .from('events')
    // host_id + the two Space axes come along for the ADR-913 price gate below: the tier that matters
    // is the PAYEE's, not the editor's (a cohost may edit an event they are not paid for).
    .select('slug, parent_event_id, details, scope_type, host_id, space_id, host_space_id')
    .eq('id', eventId)
    .maybeSingle()
  const evRow = ev as {
    slug: string; parent_event_id: string | null; details: unknown; scope_type: string | null
    host_id: string | null; space_id: string | null; host_space_id: string | null
  } | null
  const slug = evRow?.slug
  if (!slug) return fail('This event could not be found.')
  // Recurrence is an anchor-only concern (a child occurrence cannot itself recur).
  const isAnchor = !evRow?.parent_event_id
  // The scope is fixed on edit, so the row's own scope_type is the authority the
  // visibility coercion (ADR-883 step-down) keys on.
  const visibility = coerceVisibilityForScope(visibilityRequested, evRow?.scope_type)

  // Merge the note into whatever details the event already carries (object only; anything else
  // resets to a fresh object). Only computed when a note was actually submitted.
  const existingDetails =
    evRow?.details && typeof evRow.details === 'object' && !Array.isArray(evRow.details)
      ? (evRow.details as Record<string, unknown>)
      : {}
  const mergedDetails = { ...existingDetails, specialInstructions }

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
      // Only overwrite the ticket price when the form actually sent one (see priceFieldSent above),
      // so a free-mode edit never clears a price the editor did not surface.
      ...(priceFieldSent ? { price_cents: priceCents } : {}),
      // Only touch details when a note was submitted, merging so nothing else in the blob is lost.
      ...(specialInstructions ? { details: mergedDetails } : {}),
      // Only stamp recurrence on an anchor row; a child occurrence keeps recurrence_type 'none'.
      ...(isAnchor
        ? { recurrence_type: recurrenceTypeEdit, recurrence_until: recurrenceUntilEdit }
        : {}),
      // The Journey association (journey_id), authorized above. Empty when the form sent no link,
      // so an editor that does not surface the field can never wipe one.
      ...journeyLink.patch,
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

  // PROPAGATE the edit onto occurrences that already exist (ADR-884). generateOccurrencesForAnchor
  // above only MINTS missing occurrences and dedupes with ignoreDuplicates, so on its own an edit
  // changed the anchor and left every materialised child holding whatever it was born with. That
  // was visible in production as an anchor titled "Meld - Community Cowork" whose seven children
  // still read "MELD - A Community Cowork".
  //
  // Runs for ANY anchor, not just a still-recurring one: turning a series off must not strand the
  // occurrences it already made. Upcoming rows only (a past occurrence is a record of what
  // happened), and best-effort, because the anchor is already saved and a propagation failure must
  // not report the save as failed.
  if (isAnchor) {
    propagateAnchorEditsToOccurrences(eventId).catch((e) =>
      console.error('[updateEvent] occurrence propagation:', e),
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
  // A space event surfaces on its Space's Calendar console, public Calendar tab, and .ics
  // feed — refresh those too so a create/edit/cancel/delete shows up there without a wait.
  revalidatePath('/spaces', 'layout')
  // A linked event shows on its Journey, so refresh that tree when the link was touched.
  if (Object.keys(journeyLink.patch).length > 0) revalidatePath('/journeys', 'layout')
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
  void sendRsvpConfirmationSms(eventId, profileId, status, ev.title, ev.starts_at, evTz)

  try {
    const { data: profile } = await admin
      .from('profiles')
      .select('display_name, auth_user_id')
      .eq('id', profileId)
      .maybeSingle()
    if (!profile?.auth_user_id) return

    const { data: { user } } = await admin.auth.admin.getUserById(profile.auth_user_id)
    if (!user?.email) return

    // The ONE seam (ADR-169), not the bare preference read it replaced, which skipped suppression
    // (meta-scan B9 H6). Address first so suppression can see it. No subject on purpose: this is
    // the receipt for the member's own RSVP, seconds after they made it, not the Circle talking.
    if (!(await resolveSendGate(profileId, 'email', 'events', { email: user.email })).allowed) return

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
  eventTimeZone: string,
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

    // The event's OWN zone labels the when-line (a New York event must never read "PDT");
    // `timeZone` below is the MEMBER's home zone and only drives the quiet-hours gate.
    const when = formatEventWhen(startsAt, eventTimeZone)
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
        // Scope spine (ADR-827): first-class event scope, dual-written next to the legacy
        // metadata.kind + event_id convention.
        scope: { kind: 'event', id: eventId },
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
//
// 🔴 CORRECTION 2026-09-05 (scan-2 L5-01): the caller no longer falls back. "Fall back to the
// intent" meant that when NO row existed (an insert the DB refused, e.g. a suspended member's
// via trg_event_rsvps_block_suspended), `null` was read as "going": gems paid, streak ticked,
// the "You're going" email + SMS sent and a CRM lead captured, for an RSVP that was never
// stored. Every write now reads its own `error` first, and a null here after a write that
// reported success is treated as "the row cannot be read", which fires NOTHING. A missing
// confirmation email is recoverable; a paid gem for a seat that does not exist is not.
async function readRsvpStatus(eventId: string, profileId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('event_rsvps')
    .select('status')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .maybeSingle()
  if (error) {
    console.error('[events rsvp status read]', error)
    return null
  }
  return (data as { status: string } | null)?.status ?? null
}

// Member-facing copy for a refused RSVP write. The DB's own reason stays in the server log; the
// member sees one plain sentence. The suspension trigger (migration 20270344000000) is the one
// refusal a member can do something about, so it gets its own line.
const RSVP_WRITE_FAILED = 'Could not save your RSVP. Please try again.'
const RSVP_SUSPENDED = 'Your account is suspended, so you cannot RSVP right now.'

function rsvpWriteFailure(error: { message?: string } | null | undefined): ActionResult<never> {
  console.error('[events rsvp write]', error)
  const msg = error?.message ?? ''
  return fail(/suspend/i.test(msg) ? RSVP_SUSPENDED : RSVP_WRITE_FAILED)
}

// Does this event make people wait for the host? Reads `events.rsvp_requires_approval`
// (20270303000000) and FAILS CLOSED: an error, or no row at all, answers `true`.
//
// 🔴 CORRECTION 2026-09-05 (scan-2 L5-15). This replaces `eventRequiresApproval` from
// lib/events/rsvp-depth.ts at every RSVP write in this file. That reader's comment calls
// admitting on a failed read "the fail-safe direction". It is not, for the one thing the gate
// exists to protect: an approval-gated event hides its venue until the host says yes, and an
// admission cannot be un-seen. A request that lands as pending on a flaky read can be approved a
// minute later; a member admitted past the host's gate has already been told they are in and
// shown the address. The row's own `eventOpenForRsvp` read has just confirmed the event exists,
// so a null row here IS a read failure, not an unknown event.
async function eventRequiresApprovalOrClosed(eventId: string): Promise<boolean> {
  const admin = createAdminClient()
  // rsvp_requires_approval postdates the generated types (ADR-246), so the read is untyped.
  // eslint-disable-next-line no-restricted-syntax -- events.rsvp_requires_approval not in generated types yet (ADR-246 exception)
  const { data, error } = await (admin as unknown as SupabaseClient)
    .from('events')
    .select('rsvp_requires_approval')
    .eq('id', eventId)
    .maybeSingle()
  if (error || !data) {
    console.error('[events approval gate read]', error ?? 'no row')
    return true
  }
  return (data as { rsvp_requires_approval: boolean | null }).rsvp_requires_approval === true
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
/**
 * The two answers a caller needs. `open` is the hard gate — a cancelled or finished event takes
 * nothing at all. `windowOpen` gates JOINING only: a host's booking window stops new answers, it
 * does not trap the people who already answered. Somebody who said yes must always be able to say
 * no, or "close RSVPs" quietly becomes "lock the guest list", which is a different feature and one
 * nobody asked for.
 */
interface RsvpGate { open: boolean; windowOpen: boolean }
const CLOSED_FOR_RSVP: RsvpGate = { open: false, windowOpen: false }

async function eventOpenForRsvp(eventId: string): Promise<RsvpGate> {
  const admin = createAdminClient()
  // `details` and `time_zone` sit outside the generated types, so this reads untyped and casts
  // (repo convention, ADR-246). Both are returned at runtime.
  const { data } = await admin
    .from('events')
    .select('id, is_cancelled, starts_at, ends_at, time_zone, details')
    .eq('id', eventId)
    .maybeSingle()
  const ev = data as unknown as {
    id: string
    is_cancelled: boolean | null
    starts_at: string
    ends_at: string | null
    time_zone: string | null
    details: unknown
  } | null
  if (!ev || ev.is_cancelled) return CLOSED_FOR_RSVP

  const zone = resolveZone(ev.time_zone)
  // Once the gathering is OVER there is nothing left to say you are coming to. The page has hidden
  // the controls past this point since #2319; the action never enforced it, so a stale tab or a
  // direct call still minted a seat for last month's event.
  if (isEventPast(ev.starts_at, ev.ends_at, zone)) return CLOSED_FOR_RSVP

  // The host's booking window (lib/events/rsvp-window.ts). Enforced HERE and not only in the page,
  // because a control that merely hides a button is not a window (ADR-1174).
  return { open: true, windowOpen: rsvpWindowStateFromDetails(ev.details, zone) === 'open' }
}

// Drop / update / remove the "<Name> RSVP'd" entry in the event's activity feed
// (event_posts) when someone RSVPs going (EVENTS activity loop). One entry per
// (event, profile) — the partial unique index (kind='rsvp') keeps a changed RSVP
// from spamming the feed, so this UPSERTS rather than appends. A member's optional
// note (item: leave a comment when you RSVP) rides as the entry's body.
//
//   • going = true  → ensure the entry exists; when `note` is provided, set the body.
//                     A plain re-RSVP (note undefined) never wipes an earlier note.
//   • going = false → remove the entry (they moved to maybe / waitlist / not_going).
//
// Best-effort by construction: wrapped so a feed hiccup never blocks or breaks the
// RSVP itself. `event_posts.kind` is newer than the generated DB types, so this
// reaches it through the untyped-client cast (repo convention; the column ships in
// migration 20261125000000, not yet applied — until then this quietly no-ops).
const MAX_RSVP_NOTE = 500

async function syncRsvpActivityPost(
  eventId: string,
  profileId: string,
  going: boolean,
  note?: string | null,
): Promise<void> {
  try {
    const admin = createAdminClient()
    // eslint-disable-next-line no-restricted-syntax -- event_posts.kind not in generated types yet (ADR-246 exception)
    const db = admin as unknown as SupabaseClient

    const { data: existing } = await db
      .from('event_posts')
      .select('id')
      .eq('event_id', eventId)
      .eq('profile_id', profileId)
      .eq('kind', 'rsvp')
      .maybeSingle()
    const existingId = (existing as { id: string } | null)?.id ?? null

    if (!going) {
      if (existingId) await db.from('event_posts').delete().eq('id', existingId)
      return
    }

    const body = (note ?? '').trim().slice(0, MAX_RSVP_NOTE)
    if (existingId) {
      // Only rewrite the body when a note was explicitly supplied — a plain Going
      // tap (note undefined) leaves any earlier note intact.
      if (note !== undefined) {
        await db.from('event_posts').update({ body }).eq('id', existingId)
      }
      return
    }
    await db
      .from('event_posts')
      .insert({ event_id: eventId, profile_id: profileId, body, kind: 'rsvp' })
  } catch (e) {
    console.error('[events rsvp activity post]', e)
  }
}

// SEGMENT the guest into the HOSTING Space's CRM (owner directive 2026-07-26): an RSVP to a
// space-hosted event captures the guest through the 'event' lead door, labeled with the event
// and tiered going-vs-maybe — so the Space can segment guests for future marketing + follow-up
// and the guest shows on its Resonance timeline. Consent-honest by the door's own rule
// (attendance is NOT mail consent; bulk marketing still needs an opt-in; 1:1 outreach works).
// Never captures into the ROOT space (its lane is the platform CRM). Fire-and-forget, fail-safe.
async function captureRsvpLead(
  eventId: string,
  profileId: string,
  tier: 'rsvp' | 'rsvp_maybe',
): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data: ev } = await admin
      .from('events')
      .select('title, space_id, host_space_id')
      .eq('id', eventId)
      .maybeSingle()
    const evRow = ev as unknown as {
      title: string
      space_id: string | null
      host_space_id: string | null
    } | null
    // This site ALREADY had the root guard, spelled by hand on the next two lines. It now asks the
    // one resolver instead: same answer, one rule, and nothing left for the next reader to copy.
    const spaceId = await resolveHostingSpaceIdFromRow(evRow)
    if (!evRow || !spaceId) return

    const { data: prof } = await admin
      .from('profiles')
      .select('display_name, auth_user_id')
      .eq('id', profileId)
      .maybeSingle()
    if (!prof?.auth_user_id) return
    const { data: { user } } = await admin.auth.admin.getUserById(prof.auth_user_id)
    if (!user?.email) return

    await captureEventLead({
      spaceId,
      email: user.email,
      displayName: prof.display_name,
      eventTitle: evRow.title,
      tier,
      capturedByProfileId: profileId,
    })
  } catch (e) {
    console.error('[events rsvp lead capture]', e)
  }
}

export async function toggleRSVP(eventId: string) {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return
  const gate = await eventOpenForRsvp(eventId)
  if (!gate.open) return

  const admin = createAdminClient()
  const supabase = await createClient()

  const { data: existing } = await admin
    .from('event_rsvps')
    .select('id, status, approval_status')
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
      const { error } = await supabase.from('event_rsvps').update({ status: 'not_going' }).eq('id', existing.id)
      // A refused withdrawal leaves the seat held: nothing below may pretend it was freed. This
      // is a <form action> with no channel back to the page, so the outcome is logged, not shown.
      if (error) { rsvpWriteFailure(error); return }
      // Withdrawing pulls their "RSVP'd" entry out of the activity feed.
      await syncRsvpActivityPost(eventId, myProfileId, false)
      if (existing.status === 'going') {
        // The promoted seat is returned so its holder can be TOLD (scan-2 L5-02): every waitlist
        // email promises "we'll let you know", and a silent promotion breaks that promise.
        const promoted = await promoteFromWaitlist(eventId).catch((e) => { console.error('[events waitlist]', e); return null })
        if (promoted) await notifyPromotedSeat(promoted, eventId).catch((e) => console.error('[events waitlist notify]', e))
      }
    } else {
      // Re-join is a JOIN, so the host's booking window applies to it. Withdrawing above never
      // consults the window: closing RSVPs must not trap the people who already answered.
      if (!gate.windowOpen) return
      // Re-join: honour real capacity — waitlist only when genuinely full.
      const { isFull } = await getCapacityInfo(eventId)
      const next = isFull ? 'waitlist' : 'going'
      // The approval gate applies to a RE-join too. The row reaching this branch is
      // maybe/not_going — NOT currently in — so "an existing row already cleared the gate"
      // does not hold: a withdrawn 'pending' request must stay a request (re-joining is not
      // the host saying yes), and a maybe row never consulted the gate at all. Only a row
      // the host already 'approved' skips the queue.
      const needsApproval =
        existing.approval_status === 'approved'
          ? false
          : existing.approval_status === 'pending'
            ? true
            : await eventRequiresApprovalOrClosed(eventId)
      const { error } = await supabase
        .from('event_rsvps')
        .update({
          status: next,
          ...(needsApproval && existing.approval_status !== 'pending'
            ? { approval_status: 'pending' }
            : {}),
        })
        .eq('id', existing.id)
      // A refused write is the end of the story: no gems, no feed line, no email, no lead
      // (scan-2 L5-01). Logged only; a <form action> has nowhere to show the message.
      if (error) { rsvpWriteFailure(error); return }
      // The capacity trigger has the final say (a concurrent fill demotes 'going' →
      // 'waitlist'), so branch the side-effects on the PERSISTED status, not the
      // app's intent — otherwise a waitlisted guest gets gems / a host payout / a
      // "you're going" confirmation they shouldn't.
      const stored = await readRsvpStatus(eventId, myProfileId)
      // On a read failure (null) fall back to the intent; otherwise trust the row.
      // CORRECTION 2026-09-05 (scan-2 L5-01): no fallback. A row that cannot be read back is
      // not a seat, and nothing that means "you are in" may fire on the intent alone.
      if (!stored) { console.error('[events rsvp] row unreadable after update', { eventId, myProfileId }); return }
      const effective: 'going' | 'waitlist' = stored === 'going' ? 'going' : 'waitlist'
      // Nothing that means "you are in" fires while the request is pending (mirrors the
      // first-RSVP arm below): no gems/payout, no feed line, no "you're going" email.
      if (!needsApproval) {
        if (effective === 'going') onGoing(false)
        // Post the "RSVP'd" activity entry only for a confirmed seat (never waitlist).
        await syncRsvpActivityPost(eventId, myProfileId, effective === 'going')
        // Fire-and-forget confirmation — never blocks/breaks the RSVP (best-effort,
        // self-contained try-catch + pref/suppression gating inside the helper).
        sendRsvpConfirmation(eventId, myProfileId, effective).catch((e) =>
          console.error('[events rsvp confirmation email]', e)
        )
      }
      // Segment into the hosting Space's CRM for follow-up (fire-and-forget).
      void captureRsvpLead(eventId, myProfileId, 'rsvp')
    }
  } else {
    // A first RSVP is a join, so the booking window applies.
    if (!gate.windowOpen) return
    const { isFull } = await getCapacityInfo(eventId)
    const next = isFull ? 'waitlist' : 'going'
    // The host's approval gate (20270303000000). A pending seat is a REQUEST, not an admission,
    // so it is written the same way a guest's is (capture_guest_rsvp keys on the same column) and
    // the side-effects below are held back until the host says yes.
    const needsApproval = await eventRequiresApprovalOrClosed(eventId)
    const { error } = await supabase.from('event_rsvps').insert({
      event_id: eventId,
      profile_id: myProfileId,
      status: next,
      approval_status: needsApproval ? 'pending' : 'none',
    })
    // The insert the DB refuses (a suspended member, a constraint) used to fall through to the
    // side-effects below with no row behind them (scan-2 L5-01). It stops here now.
    if (error) { rsvpWriteFailure(error); return }
    // Branch on the PERSISTED status (the trigger may demote to waitlist), not intent.
    const stored = await readRsvpStatus(eventId, myProfileId)
    // CORRECTION 2026-09-05 (scan-2 L5-01): a null here used to fall back to `next`. It no longer
    // does; an unreadable row fires nothing.
    if (!stored) { console.error('[events rsvp] row unreadable after insert', { eventId, myProfileId }); return }
    const effective: 'going' | 'waitlist' = stored === 'going' ? 'going' : 'waitlist'
    // Nothing that means "you are in" fires while a request is pending: no seat-confirming email,
    // no feed line, no gems. Telling someone they are going and then making them wait for a host
    // is worse than either outcome on its own.
    if (!needsApproval) {
      if (effective === 'going') onGoing(true)
      await syncRsvpActivityPost(eventId, myProfileId, effective === 'going')
      sendRsvpConfirmation(eventId, myProfileId, effective).catch((e) =>
        console.error('[events rsvp confirmation email]', e)
      )
    }
    // Segment into the hosting Space's CRM for follow-up (fire-and-forget). A request still
    // signals intent, so this runs either way.
    void captureRsvpLead(eventId, myProfileId, 'rsvp')
  }

  revalidatePath('/events', 'layout')
  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
  // A space event surfaces on its Space's Calendar console, public Calendar tab, and .ics
  // feed — refresh those too so a create/edit/cancel/delete shows up there without a wait.
  revalidatePath('/spaces', 'layout')
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
// the broader /events layout sweep. `opts.message` is the member's optional note,
// which rides along as the body of their "RSVP'd" activity-feed entry (a Going
// RSVP posts / updates that entry; anything else removes it).
//
// Returns (added 2026-09-05, scan-2 L5-01): `{ error }` when a write was attempted and the DB
// refused it (the member's row did NOT change and NO side-effect fired), `{ data: undefined }`
// when the request was honoured (a write landed, or the row already said so), and void when the
// action never got as far as a row (signed out, or the event is closed to this move). Callers
// that ignore the value keep working; the QR door and
// the RSVP control can now show the refusal instead of a lit "Going" over an absent row.
export async function setRsvpStatus(
  eventId: string,
  intent: 'going' | 'maybe' | 'not_going',
  opts?: { slug?: string; message?: string },
): Promise<ActionResult<void> | void> {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return
  const gate = await eventOpenForRsvp(eventId)
  if (!gate.open) return
  // The booking window stops people taking a SEAT. Every move that gives one up ('maybe' frees it,
  // 'not_going' withdraws) stays available, so a host closing RSVPs does not lock anyone into a
  // seat they no longer want.
  if (!gate.windowOpen && intent === 'going') return

  const admin = createAdminClient()
  const supabase = await createClient()

  const { data: existing } = await admin
    .from('event_rsvps')
    .select('id, status, approval_status')
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
      // The gate applies to every transition INTO going, not just a new row. "An existing row
      // already cleared the gate" only holds for a row the host approved: any row reaching this
      // branch is currently maybe/not_going (see the prevStatus guard above), so a 'pending'
      // request stays a request on the upgrade, and a maybe/not_going row — which never
      // consulted the gate — is derived against the event's setting. The already-in rule the
      // old comment protected still holds: going/waitlist rows never reach this branch, so
      // turning approval on later cannot retroactively suspend anyone on the roster.
      const needsApproval =
        existing?.approval_status === 'approved'
          ? false
          : existing?.approval_status === 'pending'
            ? true
            : await eventRequiresApprovalOrClosed(eventId)
      // 🔴 Both writes read their `error` (scan-2 L5-01). They used to be awaited and discarded,
      // so a refused insert (the suspended-member trigger, a constraint, a future policy) fell
      // straight through to readRsvpStatus, which found no row, and the `stored ?? next`
      // fallback below then treated the INTENT as the seat: gems, streak, "You're going" email
      // + SMS and a CRM lead, with no RSVP row and the page still showing the member as not
      // going. Repeatable per tap, capped only by the daily gem cap.
      const { error: writeError } = existing
        ? await supabase
            .from('event_rsvps')
            .update({
              status: next,
              ...(needsApproval && existing.approval_status !== 'pending'
                ? { approval_status: 'pending' }
                : {}),
            })
            .eq('id', existing.id)
        : await supabase.from('event_rsvps').insert({
            event_id: eventId,
            profile_id: myProfileId,
            status: next,
            approval_status: needsApproval ? 'pending' : 'none',
          })
      if (writeError) return rsvpWriteFailure(writeError)
      // Branch the side-effects on the PERSISTED status: the capacity trigger may have
      // demoted this 'going' write to 'waitlist', and a waitlisted guest must not get
      // the gems / host payout / "you're going" confirmation. Fall back to intent on a
      // read failure.
      // CORRECTION 2026-09-05 (scan-2 L5-01): there is no fallback any more. A row that cannot
      // be read back after a write that reported success is a server fault, and the honest
      // answer to the member is "try again", not a lit Going with gems behind it.
      const stored = await readRsvpStatus(eventId, myProfileId)
      if (!stored) {
        console.error('[events rsvp] row unreadable after write', { eventId, myProfileId })
        return fail(RSVP_WRITE_FAILED)
      }
      const effective: 'going' | 'waitlist' = stored === 'going' ? 'going' : 'waitlist'
      if (!needsApproval) {
        if (effective === 'going') onGoing(!existing)
        // Post the "RSVP'd" entry (with the note) only for a confirmed seat.
        await syncRsvpActivityPost(eventId, myProfileId, effective === 'going', opts?.message)
        sendRsvpConfirmation(eventId, myProfileId, effective).catch((e) =>
          console.error('[events rsvp confirmation email]', e)
        )
      }
      // Segment into the hosting Space's CRM for follow-up (fire-and-forget).
      void captureRsvpLead(eventId, myProfileId, 'rsvp')
    } else if (opts?.message !== undefined) {
      // Already confirmed (going/waitlist) and just adding or editing the note — no
      // status transition, so skip the email/gems above but still sync the feed entry.
      // A waitlisted member has no going entry, so this only writes when truly going.
      await syncRsvpActivityPost(eventId, myProfileId, prevStatus === 'going', opts.message)
    }
  } else {
    // maybe / not_going: a soft state, no email, no capacity consumed.
    const db = supabase
    if (existing) {
      if (existing.status !== intent) {
        // plus_ones only mean anything for a confirmed seat — clear on stepping back.
        const { error } = await db
          .from('event_rsvps')
          .update({ status: intent, plus_ones: 0 })
          .eq('id', existing.id)
        // A refused step-back means the seat is STILL HELD: promoting the next waitlisted person
        // on top of it would overbook the room (scan-2 L5-01).
        if (error) return rsvpWriteFailure(error)
      }
    } else {
      const { error } = await db.from('event_rsvps').insert({
        event_id: eventId,
        profile_id: myProfileId,
        status: intent,
        plus_ones: 0,
      })
      if (error) return rsvpWriteFailure(error)
    }
    // Moving to maybe / not_going is no longer "going" → pull their feed entry.
    await syncRsvpActivityPost(eventId, myProfileId, false)
    // Freed a confirmed seat → pull the next person off the waitlist.
    if (heldSeat) {
      // And TELL them (scan-2 L5-02): promoteFromWaitlist returns the seat it moved precisely so
      // the holder, member or signed-out guest, can be notified. Both call sites dropped it.
      const promoted = await promoteFromWaitlist(eventId).catch((e) => { console.error('[events waitlist]', e); return null })
      if (promoted) await notifyPromotedSeat(promoted, eventId).catch((e) => console.error('[events waitlist notify]', e))
    }
    // A MAYBE is buying intent: segment into the hosting Space's CRM for the follow-up
    // funnel (fire-and-forget). An explicit Can't go just files — no capture.
    if (intent === 'maybe') void captureRsvpLead(eventId, myProfileId, 'rsvp_maybe')
  }

  revalidatePath('/events', 'layout')
  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
  // A space event surfaces on its Space's Calendar console, public Calendar tab, and .ics
  // feed — refresh those too so a create/edit/cancel/delete shows up there without a wait.
  revalidatePath('/spaces', 'layout')
  // Reflect the change on the event's own detail page right away when we know its slug.
  if (opts?.slug) revalidatePath(`/events/${opts.slug}`)
  return ok()
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
    .select('id, status, plus_ones')
    .eq('event_id', eventId)
    .eq('profile_id', myProfileId)
    .maybeSingle()

  // Only a confirmed attendee can bring guests — guard rather than create rows.
  if (!existing || existing.status !== 'going') return

  // Adding a plus-one adds a head to the room, so it obeys the same two gates a fresh RSVP does:
  // a finished or cancelled event takes nothing, and a closed booking window takes no new seats.
  // REDUCING the count is always allowed, for the same reason a withdrawal is.
  const gate = await eventOpenForRsvp(eventId)
  const current = (existing as { plus_ones?: number | null }).plus_ones ?? 0
  if (n > current && (!gate.open || !gate.windowOpen)) return

  const { error } = await supabase
    .from('event_rsvps')
    .update({ plus_ones: n })
    .eq('id', existing.id)
  // Nothing changed, so nothing to refresh (scan-2 L5-01: every event_rsvps write reads its error).
  if (error) { rsvpWriteFailure(error); return }

  revalidatePath('/events', 'layout')
  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
  // A space event surfaces on its Space's Calendar console, public Calendar tab, and .ics
  // feed — refresh those too so a create/edit/cancel/delete shows up there without a wait.
  revalidatePath('/spaces', 'layout')
}

/** Why a check-in was refused (added 2026-09-05, scan-2 L5-21). `checkInEvent` used to answer a
 *  bare `{ ok: false }` for five different situations, so the QR door (app/q/[slug]/route.ts)
 *  could only redirect in silence. The reason is a fixed token, never copy: each surface writes
 *  its own sentence in the member's voice. */
export type CheckInFailReason =
  | 'signed_out'
  | 'unavailable'
  | 'window_closed'
  | 'checkin_off'
  | 'not_going'
  | 'pending'

export interface CheckInResult {
  ok: boolean
  alreadyCheckedIn?: boolean
  zapsAwarded?: number
  /** Present only when `ok` is false. */
  reason?: CheckInFailReason
}

// Verified-practice check-in (the North-Star `practice.verified` event). Server-
// authoritative: the event must be real, started, not cancelled, and the viewer
// must have RSVP'd 'going'. Idempotent per (event, profile); the first check-in
// records the ledger event, awards zaps, and ticks the attendance streak.
// (RSVP = gems web-action; check-in = zaps verified practice; see ADR-021/024.)
export async function checkInEvent(eventId: string): Promise<CheckInResult> {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return { ok: false, reason: 'signed_out' }

  const admin = createAdminClient()
  // time_zone is newer than the generated DB types, so a plain typed select of it yields a
  // SelectQueryError type — read the row untyped and cast (repo convention). The column is
  // still returned at runtime.
  const { data: evRaw } = await admin
    .from('events')
    .select('starts_at, ends_at, is_cancelled, time_zone, theme')
    .eq('id', eventId)
    .maybeSingle()
  const ev = evRaw as unknown as {
    starts_at: string
    ends_at: string | null
    is_cancelled: boolean
    time_zone: string | null
    theme: unknown
  } | null
  // THE WINDOW (lib/events/checkin-window.ts). It opens once the event has actually STARTED in its
  // own zone — comparing the raw wall clock to now unlocked it, and awarded Zaps, ~7h early for a
  // PT event — and it SHUTS four hours past the end. There used to be no upper bound at all, so a
  // member marked going could check in to a gathering that ended in March and collect Zaps, a
  // streak tick and verified-member standing for it (ADR-1175).
  const evCheckInTz = resolveZone(ev?.time_zone)
  if (!ev || ev.is_cancelled) return { ok: false, reason: 'unavailable' }
  if (!checkInWindowOpen(ev.starts_at, ev.ends_at, evCheckInTz)) return { ok: false, reason: 'window_closed' }
  // The host's switch (lib/events/checkin-enabled.ts). Enforced HERE and not only in the UI:
  // a control that hides the button while the action still records attendance and pays Zaps is
  // not a switch, it is a coat of paint. Defaults on, so no existing event changes.
  if (!readEventCheckInEnabled(ev.theme)) return { ok: false, reason: 'checkin_off' }

  // 🔴 `status` ALONE IS NOT A SEAT. The host's approval gate writes a pending request as
  // status='going' + approval_status='pending' (see the insert above), so selecting `status` only
  // let an unapproved requester check in through the printed QR door (app/q/[slug]/route.ts) and
  // collect practice.verified, Zaps, an attendance-streak tick and permanent verified-member
  // standing — the exact side effects the approval gate holds back everywhere else. Same rule, same
  // module, as the venue disclosure on the event page: lib/events/admission.ts.
  const { data: rsvp } = await admin
    .from('event_rsvps')
    .select('status, approval_status')
    .eq('event_id', eventId)
    .eq('profile_id', myProfileId)
    .maybeSingle()
  if (rsvp?.status !== 'going') return { ok: false, reason: 'not_going' }
  if (isPendingApproval(rsvp)) return { ok: false, reason: 'pending' }

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
  // Connector loop (ADR-154 / ADR-777): if this attendee was captured as a guest for
  // THIS event by an inviter, that inviter earns the attend ⚡⚡ — their invitee showed up.
  // Fire-and-forget + fail-safe: a reward failure never affects the member's check-in.
  rewardConnectorAttendanceForCheckin(eventId, myProfileId).catch((e) => console.error('[connector]', e))
  // A first check-in changes the event's going/check-in counts the detail + manage
  // pages render, so refresh them (the 'going' branches already revalidate; this path didn't).
  revalidatePath('/events', 'layout')
  return { ok: true, zapsAwarded }
}

export async function cancelEvent(eventId: string) {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return

  // AUTHORIZATION: the host, platform staff, or whoever manages the event's parent
  // scope (its circle or owning Space) may cancel — same authority that gates every
  // other management action (event.editSettings). Gating on host_id alone silently
  // no-op'd for a space/circle manager who is not the original host.
  const caps = await getEventCapabilities(eventId)
  if (!caps.has('event.editSettings')) return

  // Use the admin client (RLS-bypassing) AFTER the capability gate, mirroring the admin
  // cancel path. The events UPDATE RLS policy only permits the host or a guide+ circle
  // manager, so an RLS-bound update would silently flip zero rows for a legitimate non-host
  // SPACE manager — the exact bug this change fixes. getEventCapabilities is the authority.
  const admin = createAdminClient()
  // IDEMPOTENCY in the write: `.eq('is_cancelled', false)` means a re-cancel affects
  // zero rows, and `.select('id')` returns the affected row, so `firstCancel` is true
  // ONLY on the live → cancelled transition — the sole condition under which we fan out
  // refunds. Authorization is enforced by the capability check above, so this update is
  // keyed on id (the manager need not be the host_id).
  const { data: flipped } = await admin
    .from('events')
    .update(cancelAudit(myProfileId, null))
    .eq('id', eventId)
    .eq('is_cancelled', false)
    .select('id')

  const firstCancel = (flipped ?? []).length > 0

  revalidatePath('/events')
  revalidatePath('/feed')
  revalidatePath('/circles', 'layout')
  // A space event surfaces on its Space's Calendar console, public Calendar tab, and .ics
  // feed — refresh those too so a create/edit/cancel/delete shows up there without a wait.
  revalidatePath('/spaces', 'layout')

  // Only refund paid tickets + notify attendees on the host-driven live → cancelled
  // transition. Mirrors the admin path (refundAndNotifyForCancelledEvent is idempotent
  // per-charge, and this guard prevents a double-refund on repeated cancels).
  if (firstCancel) {
    await refundAndNotifyForCancelledEvent(eventId)
  }
}

// ── Edit re-entry: the redraw (ADR-450 §2 · ADR-994 · ADR-996) ────────────────────────────────
//
// The Guided section of an Event's Inspector rail: the Spark's dials run over the LIVE event.
// Same four steps as every other entity (lib/studio/kernel/redraw.ts): resolve the pins, DELETE
// them from the patch, diff what is left, write only what moved.
//
// TWO THINGS ARE HONESTLY DIFFERENT ABOUT AN EVENT:
//
//   1. THERE IS NO LOCK TO OFFER. The Event manifest declares `steer: { mood, directions }` and
//      no `lock` (lib/studio/entities/event.ts), so `declaredLockKeys` resolves every requested
//      pin to nothing and the rail renders no pins at all. That is not a gap here: the redraw is
//      bounded to the two PROSE fields below, and everything a host would want to pin (the date,
//      the place, the price, the tiers, the lineup) is outside that boundary already and cannot
//      be touched by any redraw. Widening the redraw later means declaring `lock` on the
//      manifest first, which is an entity change, not an action change.
//   2. THERE IS NO "edit this event" VERA PATH. Events have a Spark and a poster scan, not an
//      edit planner, so the redraw re-runs the entity's own declared Spark (draftEventSpark)
//      over the event's own facts. That is exactly what "draft it again" means, and the Spark
//      already carries the mood dial natively.
//
// The write is deliberately narrow: TITLE and DESCRIPTION only. A model re-reading its own draft
// must never be able to move a date, a venue, or a price on a live event that people have
// already booked.

/** The manifest paths an Event redraw may touch. The rest of the flyer is the host's own fact. */
const EVENT_REDRAW_PATHS = ['title', 'description'] as const

/** What one Event redraw did: what moved, what the pins held (nothing today: the manifest
 *  declares no lock), and the previous values, for a one-tap put-it-back. */
export interface EventRedrawResult {
  changes: FieldChange[]
  kept: string[]
  before: { title?: string; description?: string }
}

/** The gate: event.editSettings, the same capability the rail is gated on. Returns the event's
 *  current copy plus the caller. */
async function authorEventCopy(eventId: string): Promise<
  | {
      profileId: string
      slug: string
      title: string
      description: string
      startsAt: string | null
      location: string | null
      category: string | null
    }
  | { error: string }
> {
  const profileId = await getMyProfileId()
  if (!profileId) return { error: 'Not signed in' }
  const caps = await getEventCapabilities(eventId)
  if (!caps.has('event.editSettings')) return { error: 'You do not manage this event.' }
  const admin = createAdminClient()
  const { data } = await admin
    .from('events')
    .select('slug, title, description, starts_at, location, category')
    .eq('id', eventId)
    .maybeSingle()
  const row = data as {
    slug: string
    title: string | null
    description: string | null
    starts_at: string | null
    location: string | null
    category: string | null
  } | null
  if (!row) return { error: 'Event not found.' }
  return {
    profileId,
    slug: row.slug,
    title: row.title ?? '',
    description: row.description ?? '',
    startsAt: row.starts_at,
    location: row.location,
    category: row.category,
  }
}

/** Write the two copy columns and refresh everything that shows them. ONE writer for the redraw
 *  and the undo, so an undo can only ever restore what a redraw was allowed to touch. */
async function writeEventCopy(
  eventId: string,
  slug: string,
  patch: { title?: string; description?: string },
): Promise<void> {
  if (Object.keys(patch).length === 0) return
  const admin = createAdminClient()
  const update: { title?: string; description?: string } = {}
  if (patch.title !== undefined) update.title = patch.title.trim().slice(0, 200)
  if (patch.description !== undefined) update.description = patch.description.trim().slice(0, 8000)
  await admin.from('events').update(update).eq('id', eventId)
  // Re-embed for the matching engine (fire-and-forget; no-ops if AI off), same as updateEvent.
  embedEvent(eventId).catch((e) => console.error('[events embed]', e))
  revalidatePath('/events')
  revalidatePath(`/events/${slug}`)
  revalidatePath(`/events/${slug}/edit`)
}

/** Re-steer an event that already exists: pick a mood, say how to approach it, and draft the
 *  copy again. Owner-gated (event.editSettings), bounded to the title and the description. */
export async function redrawEventAction(
  eventId: string,
  input: { mood?: string | null; directions?: string | null; locked?: readonly string[] },
): Promise<ActionResult<EventRedrawResult>> {
  const gate = await authorEventCopy(eventId)
  if ('error' in gate) return fail(gate.error)

  const pins = declaredLockKeys(EVENT_MANIFEST, input.locked ?? [])
  await saveSteer('event', eventId, gate.profileId, {
    mood: input.mood,
    directions: input.directions,
    locked: pins,
  })

  const brief = redrawBrief({
    manifest: EVENT_MANIFEST,
    lead: 'This event is already live. Write its name and its description again, keeping every fact it already states exactly as true as it is now. Invent nothing.',
    mood: input.mood,
    directions: input.directions,
    locked: pins,
  })

  const drafted = await draftEventSpark({
    answers: {
      what: `${gate.title}\n\n${gate.description}`.trim().slice(0, 500) || gate.title,
      when: gate.startsAt ?? '',
      where: gate.location ?? '',
      details: brief,
      mood: normalizeSeedMood(input.mood),
    },
    profileId: gate.profileId,
  })
  if (!drafted) return fail('Vera is offline right now. Try again in a moment, or edit by hand.')

  // THE GUARANTEE: pinned paths are deleted from the proposal before it is compared or written.
  // The Event manifest declares no lock today, so this resolves to a no-op delete rather than a
  // promise nobody keeps; the moment `lock` is declared, the delete starts biting with no change here.
  const proposal: Record<string, unknown> = {}
  if (drafted.title) proposal.title = drafted.title
  if (drafted.description) proposal.description = drafted.description
  const safe = applyLock(EVENT_MANIFEST, pins, proposal)

  const settled = settleRedraw({
    manifest: EVENT_MANIFEST,
    locked: pins,
    current: { title: gate.title, description: gate.description },
    proposed: displayRecord(safe),
  })
  const paths = settled.changedPaths.filter((p) => (EVENT_REDRAW_PATHS as readonly string[]).includes(p))
  if (paths.length === 0) {
    return fail('Vera kept this one as it is. Give her a direction and try again.')
  }

  const patch: { title?: string; description?: string } = {}
  const before: { title?: string; description?: string } = {}
  for (const change of settled.changes) {
    if (change.path === 'title') {
      patch.title = change.after
      before.title = gate.title
    } else if (change.path === 'description') {
      patch.description = change.after
      before.description = gate.description
    }
  }

  await writeEventCopy(eventId, gate.slug, patch)
  return ok({
    changes: settled.changes.filter((c) => paths.includes(c.path)),
    kept: settled.kept,
    before,
  })
}

/** Put it back: restore the pre-redraw copy the diff handed the rail. */
export async function restoreEventAction(
  eventId: string,
  before: { title?: string; description?: string },
): Promise<ActionResult> {
  const gate = await authorEventCopy(eventId)
  if ('error' in gate) return fail(gate.error)
  const patch: { title?: string; description?: string } = {}
  if (typeof before.title === 'string') patch.title = before.title
  if (typeof before.description === 'string') patch.description = before.description
  if (Object.keys(patch).length === 0) return fail('Nothing to put back.')
  await writeEventCopy(eventId, gate.slug, patch)
  return ok()
}
