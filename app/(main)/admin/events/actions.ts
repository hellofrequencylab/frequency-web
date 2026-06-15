'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { isStaff } from '@/lib/core/roles'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { authorizeAction } from '@/lib/admin/guard'
import { slugify } from '@/lib/utils'
import { refundTicket } from '@/lib/billing/tickets'
import { sendEventCancelledEmail } from '@/lib/email'
import { shouldSend } from '@/lib/notification-preferences'
import { saveEventLocation, type EventAddress, type AttendanceMode } from '@/lib/events/geocode'
import { nominatimGeocoder } from '@/lib/events/geocode-provider'

// Geocode-on-save for the admin surface (EVENTS-REWORK B1). The admin event forms
// collect only the free-text `location`, so we hand the event's address to the
// frozen saveEventLocation with the keyless Nominatim provider. saveEventLocation
// rewrites the structured address columns, so we read the row's EXISTING structured
// address first and pass it through unchanged — preserving anything the member
// create form set — and only fall back to the free-text `location` (as a single-line
// query in `street`) when there is no structured address to geocode. Best-effort:
// never throws into the save; a blank/sparse address simply leaves geog NULL.
async function geocodeEventLocation(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  location: string | null,
): Promise<void> {
  try {
    // Read the row's current geo columns + attendance mode (newer than the generated
    // types → untyped cast, repo convention).
    const { data: row } = await (admin)
      .from('events')
      .select('venue_name, street, city, region, country, postal_code, attendance_mode, online_url')
      .eq('id', eventId)
      .maybeSingle()
    const r = (row ?? {}) as {
      venue_name?: string | null
      street?: string | null
      city?: string | null
      region?: string | null
      country?: string | null
      postal_code?: string | null
      attendance_mode?: string | null
      online_url?: string | null
    }

    const existing: EventAddress = {
      venueName: r.venue_name ?? null,
      street: r.street ?? null,
      city: r.city ?? null,
      region: r.region ?? null,
      country: r.country ?? null,
      postalCode: r.postal_code ?? null,
    }
    const hasStructured = Boolean(
      existing.venueName || existing.street || existing.city || existing.region || existing.postalCode,
    )

    // Prefer the structured address; otherwise place the free-text line as a single
    // query in `street` so the whole string reaches the provider.
    const address: EventAddress = hasStructured
      ? existing
      : { ...existing, street: location?.trim() || null }

    const attendanceMode: AttendanceMode =
      r.attendance_mode === 'online' || r.attendance_mode === 'hybrid'
        ? r.attendance_mode
        : 'in_person'

    await saveEventLocation(eventId, {
      address,
      attendanceMode,
      onlineUrl: r.online_url ?? null,
      geocoder: nominatimGeocoder,
    })
  } catch (e) {
    console.error('[admin events geocode]', e)
  }
}

// Shared guard: community host+ (the floor for event management in /admin).
async function requireEventHost() {
  return authorizeAction(await getCallerProfile(), 'host', 'community')
}

// Scope-aware guard: the caller must hold event.editSettings on THIS event
// (they host it, manage its circle, or are community admin+/staff). Mirrors the
// pattern used by toggleCancelEvent / updateEventDetails in admin/actions.ts.
async function requireEventEditor(eventId: string) {
  const [caller, caps] = await Promise.all([getCallerProfile(), getEventCapabilities(eventId)])
  if (!caller) throw new Error('Unauthorized')
  if (caps.has('event.editSettings')) return caller
  if (isStaff(caller.webRole)) return caller // platform staff (web_role, ADR-208) — global reach
  throw new Error('Unauthorized')
}

// ── Create ─────────────────────────────────────────────────────────────────────
// Admin-side create: identical to the member-facing action but explicitly gated
// with community host+ (no gamification awards — admin ops shouldn't game zaps).

export async function createEvent(fd: FormData) {
  const caller = await requireEventHost()
  const admin = createAdminClient()

  const title       = (fd.get('title') as string).trim()
  const description = (fd.get('description') as string)?.trim() || null
  const location    = (fd.get('location') as string)?.trim() || null
  const scopeId     = (fd.get('scope_id') as string).trim()
  const startsAt    = fd.get('starts_at') as string
  const endsAt      = (fd.get('ends_at') as string) || null

  if (!title || !scopeId || !startsAt) throw new Error('title, scope_id, and starts_at are required')

  const base = slugify(title) + '-' + startsAt.slice(0, 10)
  let slug   = base
  const { data: existing } = await admin.from('events').select('slug').eq('slug', slug).maybeSingle()
  if (existing) slug = base + '-' + Math.random().toString(36).slice(2, 6)

  const { data: inserted, error } = await admin.from('events').insert({
    title,
    description,
    location,
    scope_id:   scopeId,
    scope_type: 'circle',
    starts_at:  new Date(startsAt).toISOString(),
    ends_at:    endsAt ? new Date(endsAt).toISOString() : null,
    host_id:    caller.id,
    slug,
  }).select('id').single()
  if (error) throw new Error(error.message)

  // Geocode the venue to a map point (best-effort; never fails the create).
  if (inserted) await geocodeEventLocation(admin, inserted.id, location)

  revalidatePath('/admin/events')
  revalidatePath('/events')
  revalidatePath('/feed')
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateEvent(id: string, fd: FormData) {
  await requireEventEditor(id)
  const admin   = createAdminClient()
  const startsAt = fd.get('starts_at') as string
  const endsAt   = fd.get('ends_at') as string

  // Ticket price in dollars → cents (ADR-177). Blank/0 = free (no ticket, RSVP only).
  // `price_cents` isn't in the generated types yet, so the update object is cast.
  const priceRaw = (fd.get('price') as string)?.trim()
  const priceNum = priceRaw ? Number(priceRaw) : 0
  const priceCents = Number.isFinite(priceNum) && priceNum > 0 ? Math.round(priceNum * 100) : null

  const location = (fd.get('location') as string)?.trim() || null

  // price_cents isn't in the generated types yet — untyped cast (repo convention).
  const { error } = await (admin).from('events').update({
    title:       (fd.get('title') as string).trim(),
    description: (fd.get('description') as string)?.trim() || null,
    location,
    starts_at:   startsAt ? new Date(startsAt).toISOString() : undefined,
    ends_at:     endsAt   ? new Date(endsAt).toISOString()   : null,
    price_cents: priceCents,
  }).eq('id', id)
  if (error) throw new Error(error.message)

  // Re-resolve the map point from the (possibly changed) location. Best-effort:
  // preserves any structured address already on the row; never fails the save.
  await geocodeEventLocation(admin, id, location)

  revalidatePath('/admin/events')
  revalidatePath('/events')
  revalidatePath('/feed')
}

// ── Cancel / reinstate ────────────────────────────────────────────────────────

export async function cancelEvent(id: string) {
  // AUTHORIZATION: host of this event / its circle manager / community admin+.
  // Re-verified here (never trusts the client); refund + notify run ONLY behind it.
  await requireEventEditor(id)
  const admin = createAdminClient()

  // Flip the flag and learn whether THIS call is the one that transitioned the
  // event from live → cancelled. `.eq('is_cancelled', false)` + `.select()` means
  // a re-run (already cancelled) returns zero rows, so the refund + notify side
  // effects below run at most once per cancellation — the email idempotency guard.
  // (refundTicket is itself idempotent on the money side regardless.)
  const { data: flipped, error } = await admin
    .from('events')
    .update({ is_cancelled: true })
    .eq('id', id)
    .eq('is_cancelled', false)
    .select('id')
  if (error) throw new Error(error.message)

  const firstCancel = (flipped ?? []).length > 0

  revalidatePath('/admin/events')
  revalidatePath('/events')
  revalidatePath('/feed')

  // Only fan out refunds + notifications on the live → cancelled transition.
  if (firstCancel) {
    await refundAndNotifyForCancelledEvent(id)
  }
}

interface CancelTicketRow {
  id: string
  buyer_profile_id: string | null
}

interface CancelEventMeta {
  title: string
  slug: string
  starts_at: string
}

/** When `formatAbsolute` lands in a shared util we can swap this — kept local to
 *  avoid a cross-module import for one date string. Renders in UTC (no per-profile
 *  timezone yet), e.g. "Wed, Jul 22 · 7:00 AM UTC". */
function formatEventWhen(iso: string): string {
  return new Date(iso)
    .toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      timeZone: 'UTC', timeZoneName: 'short',
    })
    .replace(',', '')
    .replace(' at ', ' · ')
}

/** Resolve a profile's email + display name (email lives on the auth user, not the
 *  profile). Returns null when there's no deliverable address. */
async function resolveRecipient(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
): Promise<{ email: string; name: string } | null> {
  const { data: profile } = await admin
    .from('profiles')
    .select('display_name, auth_user_id')
    .eq('id', profileId)
    .maybeSingle()
  if (!profile?.auth_user_id) return null
  const { data: { user } } = await admin.auth.admin.getUserById(profile.auth_user_id)
  if (!user?.email) return null
  return { email: user.email, name: profile.display_name ?? 'there' }
}

/** Refund every paid ticket for a just-cancelled event, then notify paid attendees
 *  (refunded) and free RSVP'd attendees (cancelled). MONEY-SAFE:
 *   • refundTicket() is idempotent (already-refunded → ok) and frees inventory via
 *     recordTicketRefund — we never reimplement the Stripe unwind here.
 *   • Refunds run sequentially; one failure is logged + collected, never aborts the
 *     rest (a single bad charge can't strand the other attendees' money).
 *   • Email is best-effort and enqueued (durable outbox), so a mail hiccup never
 *     rolls back a refund; sends respect email_events prefs + suppression like every
 *     other transactional event email.
 *  This whole routine is only invoked on the live → cancelled transition, so it's
 *  not re-run (no double-email) on a repeated cancel. */
async function refundAndNotifyForCancelledEvent(eventId: string): Promise<void> {
  const admin = createAdminClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

  const { data: eventData } = await admin
    .from('events')
    .select('title, slug, starts_at')
    .eq('id', eventId)
    .maybeSingle()
  const event = eventData as CancelEventMeta | null
  if (!event) return
  const eventUrl = `${appUrl}/events/${event.slug}`
  const whenAbsolute = formatEventWhen(event.starts_at)

  // ── 1. Refund every succeeded ticket (idempotent + frees inventory) ──────────
  // `event_tickets` isn't in the generated DB types yet → untyped-client cast
  // (the lib/billing/* convention).
  const { data: ticketData } = await (admin)
    .from('event_tickets')
    .select('id, buyer_profile_id')
    .eq('event_id', eventId)
    .eq('status', 'succeeded')
  const tickets = (ticketData ?? []) as CancelTicketRow[]

  const refundedBuyerIds = new Set<string>()
  const failures: { ticketId: string; error: string }[] = []

  for (const ticket of tickets) {
    try {
      const r = await refundTicket(ticket.id, eventId)
      if (r.error) {
        failures.push({ ticketId: ticket.id, error: r.error })
        console.error('[cancelEvent] refund failed', { eventId, ticketId: ticket.id, error: r.error })
        continue
      }
      if (ticket.buyer_profile_id) refundedBuyerIds.add(ticket.buyer_profile_id)
    } catch (err) {
      failures.push({ ticketId: ticket.id, error: String(err) })
      console.error('[cancelEvent] refund threw', { eventId, ticketId: ticket.id, err })
    }
  }

  if (failures.length) {
    console.error('[cancelEvent] refund summary', {
      eventId,
      total: tickets.length,
      refunded: tickets.length - failures.length,
      failed: failures.length,
    })
  }

  // ── 2. Notify refunded buyers (best-effort, never blocks/rolls back a refund) ─
  for (const buyerId of refundedBuyerIds) {
    try {
      if (!(await shouldSend(buyerId, 'email', 'events'))) continue
      const recipient = await resolveRecipient(admin, buyerId)
      if (!recipient) continue
      await sendEventCancelledEmail({
        to: recipient.email,
        recipientName: recipient.name,
        recipientProfileId: buyerId,
        eventTitle: event.title,
        whenAbsolute,
        eventUrl,
        refunded: true,
      })
    } catch (err) {
      console.error('[cancelEvent] notify (refunded) failed', { eventId, buyerId, err })
    }
  }

  // ── 3. Notify free RSVP'd attendees (no money — just "the event was cancelled").
  // Skip anyone we already emailed as a refunded buyer to avoid a duplicate note.
  const { data: rsvpData } = await admin
    .from('event_rsvps')
    .select('profile_id')
    .eq('event_id', eventId)
    .eq('status', 'going')
  const rsvpProfileIds = ((rsvpData ?? []) as { profile_id: string }[]).map((r) => r.profile_id)

  for (const profileId of rsvpProfileIds) {
    if (refundedBuyerIds.has(profileId)) continue
    try {
      if (!(await shouldSend(profileId, 'email', 'events'))) continue
      const recipient = await resolveRecipient(admin, profileId)
      if (!recipient) continue
      await sendEventCancelledEmail({
        to: recipient.email,
        recipientName: recipient.name,
        recipientProfileId: profileId,
        eventTitle: event.title,
        whenAbsolute,
        eventUrl,
        refunded: false,
      })
    } catch (err) {
      console.error('[cancelEvent] notify (rsvp) failed', { eventId, profileId, err })
    }
  }
}

export async function reinstateEvent(id: string) {
  await requireEventEditor(id)
  const admin = createAdminClient()
  const { error } = await admin.from('events').update({ is_cancelled: false }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/events')
  revalidatePath('/events')
  revalidatePath('/feed')
}

// ── Ticket tiers (EVENTS-SYSTEM §2.2) ────────────────────────────────────────────
// Named tiers with richer pricing modes + inventory. Written ONLY through the
// service role (admin client) behind the event-editor authz gate; the `sold` count
// is owned by the billing webhook and is never set here. `event_ticket_types` isn't
// in the generated types yet → untyped-client cast (repo convention).

type PricingMode = 'fixed' | 'free' | 'pwyc' | 'sliding_scale' | 'donation'
const PRICING_MODES: PricingMode[] = ['fixed', 'free', 'pwyc', 'sliding_scale', 'donation']

/** Dollars string from a form field → integer cents, or null when blank. */
function dollarsToCents(raw: FormDataEntryValue | null): number | null {
  const s = (raw as string | null)?.trim()
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

/** Create a ticket tier on an event. The caller must be able to edit the event. */
export async function createTicketTier(eventId: string, slug: string, fd: FormData) {
  await requireEventEditor(eventId)
  const admin = createAdminClient()

  const name = (fd.get('name') as string)?.trim()
  if (!name) throw new Error('A tier name is required.')
  const mode = (fd.get('pricing_mode') as string)?.trim() as PricingMode
  if (!PRICING_MODES.includes(mode)) throw new Error('Invalid pricing mode.')

  const priceCents = dollarsToCents(fd.get('price'))
  const minCents = dollarsToCents(fd.get('min'))
  const suggestedCents = dollarsToCents(fd.get('suggested'))
  const qtyRaw = (fd.get('quantity') as string)?.trim()
  const quantity = qtyRaw ? Math.max(0, Math.floor(Number(qtyRaw))) : null

  // A fixed tier must carry a price; buyer-chosen modes lean on min/suggested.
  if (mode === 'fixed' && (priceCents == null || priceCents <= 0)) {
    throw new Error('A fixed-price tier needs a price.')
  }

  const { error } = await admin.from('event_ticket_types').insert({
    event_id: eventId,
    name,
    description: (fd.get('description') as string)?.trim() || null,
    pricing_mode: mode,
    price_cents: mode === 'fixed' ? priceCents : null,
    min_cents: mode === 'free' || mode === 'fixed' ? null : minCents,
    suggested_cents: mode === 'free' || mode === 'fixed' ? null : suggestedCents,
    quantity,
    member_only: fd.get('member_only') === 'on',
    sort_order: Number((fd.get('sort_order') as string) || 0) || 0,
    active: true,
  })
  if (error) throw new Error(error.message)

  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath(`/events/${slug}`)
}

/** Edit a tier's catalog fields. Never touches `sold` (billing-owned). */
export async function updateTicketTier(tierId: string, eventId: string, slug: string, fd: FormData) {
  await requireEventEditor(eventId)
  const admin = createAdminClient()

  const name = (fd.get('name') as string)?.trim()
  if (!name) throw new Error('A tier name is required.')
  const mode = (fd.get('pricing_mode') as string)?.trim() as PricingMode
  if (!PRICING_MODES.includes(mode)) throw new Error('Invalid pricing mode.')

  const priceCents = dollarsToCents(fd.get('price'))
  if (mode === 'fixed' && (priceCents == null || priceCents <= 0)) {
    throw new Error('A fixed-price tier needs a price.')
  }
  const qtyRaw = (fd.get('quantity') as string)?.trim()
  const quantity = qtyRaw ? Math.max(0, Math.floor(Number(qtyRaw))) : null

  const { error } = await admin
    .from('event_ticket_types')
    .update({
      name,
      description: (fd.get('description') as string)?.trim() || null,
      pricing_mode: mode,
      price_cents: mode === 'fixed' ? priceCents : null,
      min_cents: mode === 'free' || mode === 'fixed' ? null : dollarsToCents(fd.get('min')),
      suggested_cents: mode === 'free' || mode === 'fixed' ? null : dollarsToCents(fd.get('suggested')),
      quantity,
      member_only: fd.get('member_only') === 'on',
      sort_order: Number((fd.get('sort_order') as string) || 0) || 0,
    })
    .eq('id', tierId)
    .eq('event_id', eventId)
  if (error) throw new Error(error.message)

  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath(`/events/${slug}`)
}

/** Retire / reactivate a tier. Retiring stops new sales but keeps it for the
 *  tickets already sold against it (it's never hard-deleted while sold > 0). */
export async function setTicketTierActive(
  tierId: string,
  eventId: string,
  slug: string,
  active: boolean,
) {
  await requireEventEditor(eventId)
  const admin = createAdminClient()
  const { error } = await admin
    .from('event_ticket_types')
    .update({ active })
    .eq('id', tierId)
    .eq('event_id', eventId)
  if (error) throw new Error(error.message)

  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath(`/events/${slug}`)
}
