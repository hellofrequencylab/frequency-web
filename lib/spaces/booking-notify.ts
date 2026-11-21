// BOOKING NOTIFICATIONS (1:1 booking lifecycle, ADR-605 P3). Confirmation (member + owner, with an
// .ics attachment), a scheduled reminder (a durable outbox job, idempotent), and cancellation notices.
// Server-only: reads through the service-role admin client and enqueues email via the existing spine
// (lib/email.ts + lib/queue/outbox.ts). Everything here is BEST-EFFORT: a mail hiccup never blocks or
// rolls back a booking, and every send respects global suppression inside sendRawEmail.
//
// The reminder is idempotent by DESIGN: the job carries only the booking id, and the handler re-reads
// the booking at fire time. If the booking is no longer 'confirmed' (cancelled, or replaced by a
// reschedule), the reminder simply no-ops. So a cancel / reschedule needs no job surgery: cancelling
// the booking cancels its reminder, and a reschedule enqueues a fresh reminder for the new booking.
//
// GUEST BOOKERS (LIVE-835). A booking from a Space website may have no member profile: the guest's own
// name and email stand in for it. Their mail goes to that address, and its link opens the website's Book
// page, never Frequency (owner ask 2026-10-07: "The website is stand alone"). The owner's copy is unchanged.

import { createAdminClient } from '@/lib/supabase/admin'
import { enqueue } from '@/lib/queue/outbox'
import { routeNotification } from '@/lib/notifications/router'
import {
  sendBookingConfirmationEmail,
  sendGuestBookingConfirmEmail,
  buildBookingReminderEmail,
  sendBookingCancelledEmail,
  enqueueEmail,
} from '@/lib/email'
import { madeWithUrl } from '@/lib/marketing/made-with'
import { envString } from '@/lib/env/string'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000 // 24h before the session
export const BOOKING_REMINDER_KIND = 'booking_reminder'

// A loose query surface for the not-yet-typed booking tables (ADR-246, mirroring lib/spaces/booking.ts):
// space_availability_schedules / space_availability / space_bookings are absent from the generated DB
// types, so reach them through an untyped cast.
type LooseQuery = {
  select: (cols: string) => LooseQuery
  eq: (col: string, val: unknown) => LooseQuery
  limit: (n: number) => LooseQuery
  order: (col: string, opts: { ascending: boolean }) => LooseQuery
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>
}
function looseFrom(admin: Admin, table: string): LooseQuery {
  return (admin as unknown as { from: (t: string) => LooseQuery }).from(table)
}

/** The context a caller (createBooking / rescheduleBooking) already holds, so confirmation mail needs
 *  no re-read of the just-written row. */
interface BookingNotifyContext {
  bookingId: string
  spaceId: string
  spaceSlug: string
  spaceName: string
  ownerProfileId: string | null
  /** Null for a guest booking (LIVE-835); `guest` then names who to mail. */
  memberProfileId: string | null
  memberName: string | null
  /** LIVE-835: a guest booker from the Space's website, mailed at the address they gave with a link to
   *  the website's Book page. Null for a member booking. */
  guest?: GuestRecipient | null
  startsAt: string
  endsAt: string
  serviceName: string | null
  /** BOOK-008: the calendar identity of this booking's invite. Omitted, it is read from the booking: the
   *  first booking of its rescheduled_from chain is the UID, and the chain's depth the SEQUENCE, so a moved
   *  booking updates the one calendar event instead of adding a second. */
  invite?: { uid: string; sequence: number } | null
}

/** A guest booker (LIVE-835): where their mail goes and the website link it carries. */
interface GuestRecipient {
  name: string
  email: string
  manageUrl: string
}

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────

type Admin = ReturnType<typeof createAdminClient>

/** Resolve a profile's deliverable email + name (email lives on the auth user). Null when none. */
async function resolveRecipient(
  admin: Admin,
  profileId: string,
): Promise<{ email: string; name: string } | null> {
  try {
    const { data: profile } = await admin
      .from('profiles')
      .select('display_name, auth_user_id')
      .eq('id', profileId)
      .maybeSingle()
    const p = profile as { display_name: string | null; auth_user_id: string | null } | null
    if (!p?.auth_user_id) return null
    const {
      data: { user },
    } = await admin.auth.admin.getUserById(p.auth_user_id)
    if (!user?.email) return null
    return { email: user.email, name: p.display_name?.trim() || 'there' }
  } catch {
    return null
  }
}

/** The booker's mail address: the guest's own (LIVE-835), else the member profile's. Null when neither. */
async function bookerRecipient(
  admin: Admin,
  ctx: { memberProfileId: string | null; guest?: GuestRecipient | null },
): Promise<{ email: string; name: string } | null> {
  if (ctx.guest) return { email: ctx.guest.email, name: ctx.guest.name }
  return ctx.memberProfileId ? resolveRecipient(admin, ctx.memberProfileId) : null
}

function durationMinutes(startsAt: string, endsAt: string): number {
  const ms = new Date(endsAt).getTime() - new Date(startsAt).getTime()
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 60000) : 30
}

/** Format a booking instant in a timezone, e.g. "Wed, Jul 22 · 7:00 AM PDT". Fail-safe to a plain UTC. */
function formatWhen(iso: string, timezone: string): string {
  try {
    return new Date(iso)
      .toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: timezone,
        timeZoneName: 'short',
      })
      .replace(',', '')
      .replace(' at ', ' · ')
  } catch {
    return new Date(iso).toUTCString()
  }
}

// ── ICS (RFC 5545), inline attachment — no external hosting / auth ──────────────────────────────

function icsStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  )
}
function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** The address a booking invite names as its ORGANIZER: the no-reply sender every booking email already
 *  comes from (lib/email.ts EMAIL_FROM), so a calendar never offers to write to a person's own inbox. */
function organizerAddress(): string {
  const from = envString('EMAIL_FROM', 'Frequency <noreply@send.frequencylocal.com>')
  const inside = /<([^<>\s]+@[^<>\s]+)>/.exec(from)?.[1] ?? (/^[^\s<>]+@[^\s<>]+$/.test(from.trim()) ? from.trim() : null)
  return inside ?? 'noreply@send.frequencylocal.com'
}

/** A CN parameter value: quoted, with the characters a quoted parameter cannot hold removed. */
function icsParam(s: string): string {
  return `"${s.replace(/["\r\n\\]/g, '').trim() || 'Frequency'}"`
}

/** Fold a content line at 75 octets (RFC 5545 3.1): CRLF plus one space before each continuation. */
function icsFold(line: string): string {
  if (Buffer.byteLength(line, 'utf-8') <= 75) return line
  const out: string[] = []
  let cur = ''
  for (const ch of line) {
    const limit = out.length === 0 ? 75 : 74
    if (Buffer.byteLength(cur + ch, 'utf-8') > limit) {
      out.push(cur)
      cur = ch
    } else cur += ch
  }
  if (cur) out.push(cur)
  return out.join('\r\n ')
}

/** What a booking invite says. `method` REQUEST adds or updates the event in the booker's calendar; CANCEL
 *  removes it. The UID must stay the same across a reschedule, and SEQUENCE must grow with every change. */
export interface BookingIcsParams {
  method: 'REQUEST' | 'CANCEL'
  uid: string
  sequence: number
  startsAt: string
  endsAt: string
  summary: string
  url: string
  /** The Space, named as the organizer (the address is the no-reply sender). */
  organizerName: string
  /** The booker. Omitted when unknown. */
  attendee?: { name: string; email: string } | null
  /** Where it happens. Omitted when the service names no place yet (BOOK-010 adds one). */
  location?: string | null
}

/** A single-event VCALENDAR for a booking, as text. Pure. */
export function buildBookingIcs(params: BookingIcsParams): string {
  const cancel = params.method === 'CANCEL'
  const location = params.location?.trim()
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Frequency//Booking//EN',
    'CALSCALE:GREGORIAN',
    cancel ? 'METHOD:CANCEL' : 'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${params.uid}@frequency`,
    `SEQUENCE:${Math.max(0, Math.floor(params.sequence))}`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(new Date(params.startsAt))}`,
    `DTEND:${icsStamp(new Date(params.endsAt))}`,
    `SUMMARY:${icsEscape(params.summary)}`,
    `ORGANIZER;CN=${icsParam(params.organizerName)}:mailto:${organizerAddress()}`,
    ...(params.attendee
      ? [
          `ATTENDEE;CN=${icsParam(params.attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=${cancel ? 'DECLINED' : 'ACCEPTED'};RSVP=FALSE:mailto:${params.attendee.email.replace(/[\s<>"]/g, '')}`,
        ]
      : []),
    ...(location ? [`LOCATION:${icsEscape(location)}`] : []),
    `URL:${icsEscape(params.url)}`,
    `STATUS:${cancel ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(icsFold).join('\r\n') + '\r\n'
}

/** The same invite as a base64 string ready to attach. Pure. */
function buildBookingIcsBase64(params: BookingIcsParams): string {
  return Buffer.from(buildBookingIcs(params), 'utf-8').toString('base64')
}

/** True when the runtime can format in `tz`. Local on purpose: this module is loaded by a sandboxed
 *  copy probe (scripts/probes/lifecycle-copy.mjs) whose reviewed-import list it must not grow. */
function usableZone(tz: string | null | undefined): tz is string {
  if (!tz || !/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/.test(tz)) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** The Space's booking timezone label source: the schedule tz, else the first window tz, else the
 *  Space's calendar zone (every Space carries one since LIVE-471's backfill), else UTC. BOOK-001: a stored value the runtime cannot resolve
 *  ("Pacific") is skipped, so a confirmation never prints a time in UTC by accident. */
async function bookingTimezone(admin: Admin, spaceId: string): Promise<string> {
  const candidates: Array<string | null | undefined> = []
  try {
    const { data: sched } = await looseFrom(admin, 'space_availability_schedules')
      .select('timezone')
      .eq('space_id', spaceId)
      .eq('active', true)
      .limit(1)
      .maybeSingle()
    candidates.push((sched as { timezone?: string } | null)?.timezone)
  } catch {
    /* fall through */
  }
  try {
    const { data: win } = await looseFrom(admin, 'space_availability')
      .select('timezone')
      .eq('space_id', spaceId)
      .limit(1)
      .maybeSingle()
    candidates.push((win as { timezone?: string } | null)?.timezone)
  } catch {
    /* fall through */
  }
  for (const tz of candidates) if (tz && usableZone(tz.trim())) return tz.trim()
  try {
    const { data: space } = await looseFrom(admin, 'spaces').select('time_zone').eq('id', spaceId).maybeSingle()
    const zone = (space as { time_zone?: string | null } | null)?.time_zone?.trim()
    return usableZone(zone) ? zone : 'UTC'
  } catch {
    return 'UTC'
  }
}

// ── BOOK-008 / BOOK-014: what a booking's mail needs that its caller may not hold ─────────────────

/** The calendar identity of a booking's invite: the first booking of its rescheduled_from chain is the UID,
 *  and how many moves led here is the SEQUENCE. A database without the column (or any read miss) gives the
 *  booking's own id at SEQUENCE 0, which is what every invite said before. */
async function inviteIdentity(admin: Admin, bookingId: string): Promise<{ uid: string; sequence: number }> {
  let uid = bookingId
  let sequence = 0
  const seen = new Set([bookingId])
  try {
    for (let hop = 0; hop < 25; hop++) {
      const { data, error } = await looseFrom(admin, 'space_bookings').select('id, rescheduled_from').eq('id', uid).maybeSingle()
      const prev = !error && typeof data?.rescheduled_from === 'string' ? data.rescheduled_from : null
      if (!prev || seen.has(prev)) break
      seen.add(prev)
      uid = prev
      sequence++
    }
  } catch {
    /* keep what was read so far */
  }
  return { uid, sequence }
}

/** A service's name by id, active or not. Null when there is none to name. */
async function serviceNameOf(admin: Admin, serviceTypeId: unknown): Promise<string | null> {
  if (typeof serviceTypeId !== 'string' || !serviceTypeId) return null
  try {
    const { data } = await looseFrom(admin, 'space_service_types').select('name').eq('id', serviceTypeId).maybeSingle()
    const name = data?.name
    return typeof name === 'string' && name.trim() ? name.trim() : null
  } catch {
    return null
  }
}

/** The cancelled booking a notice is about, when the caller did not name it: the newest cancelled booking of
 *  this booker at this start on this Space. Null on any miss (the notice then goes without a calendar file). */
async function findCancelledBooking(
  admin: Admin,
  ctx: { spaceId: string; startsAt: string; memberProfileId: string | null; guest?: GuestRecipient | null },
): Promise<Record<string, unknown> | null> {
  try {
    let q = looseFrom(admin, 'space_bookings')
      .select('id, ends_at, service_type_id')
      .eq('space_id', ctx.spaceId)
      .eq('starts_at', ctx.startsAt)
      .eq('status', 'cancelled')
    if (ctx.memberProfileId) q = q.eq('member_profile_id', ctx.memberProfileId)
    else if (ctx.guest) q = q.eq('guest_email', ctx.guest.email)
    else return null
    const { data, error } = await q.order('cancelled_at', { ascending: false }).limit(1).maybeSingle()
    return error ? null : data
  } catch {
    return null
  }
}

// ── public: confirmation, reminder scheduling, cancellation ─────────────────────────────────────

/** Send the confirmation email to the member (with .ics) and the owner. Best-effort; never throws. */
export async function notifyBookingConfirmed(ctx: BookingNotifyContext): Promise<void> {
  try {
    const admin = createAdminClient()
    const tz = await bookingTimezone(admin, ctx.spaceId)
    const whenAbsolute = formatWhen(ctx.startsAt, tz)
    const mins = durationMinutes(ctx.startsAt, ctx.endsAt)
    const manageUrl = `${APP_URL}/spaces/${ctx.spaceSlug}/book`
    const member = await bookerRecipient(admin, ctx)
    // BOOK-008: an invite, not a published copy. Same UID across a move, a higher SEQUENCE each time.
    const invite = ctx.invite ?? (await inviteIdentity(admin, ctx.bookingId))
    const inviteBase = {
      method: 'REQUEST' as const,
      uid: invite.uid,
      sequence: invite.sequence,
      startsAt: ctx.startsAt,
      endsAt: ctx.endsAt,
      summary: ctx.serviceName ?? `Session with ${ctx.spaceName}`,
      organizerName: ctx.spaceName,
      attendee: member,
      location: null,
    }
    const icsBase64 = buildBookingIcsBase64({ ...inviteBase, url: manageUrl })
    if (member) {
      await sendBookingConfirmationEmail({
        to: member.email,
        recipientName: member.name,
        audience: 'member',
        recipientIsGuest: !!ctx.guest,
        spaceName: ctx.spaceName,
        serviceName: ctx.serviceName,
        whenAbsolute,
        durationMinutes: mins,
        otherPartyName: ctx.spaceName,
        manageUrl: ctx.guest?.manageUrl ?? manageUrl,
        // A guest's calendar entry links back to the website, like their email.
        icsBase64: ctx.guest
          ? buildBookingIcsBase64({ ...inviteBase, url: ctx.guest.manageUrl })
          : icsBase64,
        // The customer's copy carries the mark (LIVE-804); the owner's is a work notice and does not.
        madeWith: { label: 'Made with Frequency', url: madeWithUrl('booking-email', APP_URL) },
      })
    }
    if (ctx.ownerProfileId && ctx.ownerProfileId !== ctx.memberProfileId) {
      const owner = await resolveRecipient(admin, ctx.ownerProfileId)
      if (owner) {
        await sendBookingConfirmationEmail({
          to: owner.email,
          recipientName: owner.name,
          audience: 'owner',
          spaceName: ctx.spaceName,
          serviceName: ctx.serviceName,
          whenAbsolute,
          durationMinutes: mins,
          // A guest is named with the address they gave, so the owner can write back.
          otherPartyName: ctx.guest
            ? `${ctx.guest.name} (${ctx.guest.email})`
            : (ctx.memberName ?? member?.name ?? 'A member'),
          manageUrl,
          icsBase64,
        })
      }
    }
  } catch (err) {
    console.error('[booking-notify] confirm failed', err)
  }
}

/** SCAN-834: the one email a website guest's HOLD sends, before anything is confirmed: the link that
 *  proves the address they typed. No .ics, no owner copy, no reminder; those follow the click. Best-effort;
 *  never throws. */
export async function notifyGuestBookingHold(ctx: {
  spaceId: string
  spaceName: string
  guest: { name: string; email: string }
  startsAt: string
  endsAt: string
  serviceName: string | null
  confirmUrl: string
  holdMinutes: number
}): Promise<void> {
  try {
    const admin = createAdminClient()
    const tz = await bookingTimezone(admin, ctx.spaceId)
    await sendGuestBookingConfirmEmail({
      to: ctx.guest.email,
      guestName: ctx.guest.name,
      spaceName: ctx.spaceName,
      serviceName: ctx.serviceName,
      whenAbsolute: formatWhen(ctx.startsAt, tz),
      durationMinutes: durationMinutes(ctx.startsAt, ctx.endsAt),
      confirmUrl: ctx.confirmUrl,
      holdMinutes: ctx.holdMinutes,
    })
  } catch (err) {
    console.error('[booking-notify] guest hold email failed', err)
  }
}

/** Enqueue a durable reminder job for `startsAt - lead`. Idempotent by design (the handler re-checks
 *  the booking status). Best-effort; never throws back into the booking flow. */
export async function scheduleBookingReminder(bookingId: string, startsAt: string): Promise<void> {
  try {
    const fireMs = new Date(startsAt).getTime() - REMINDER_LEAD_MS
    const runAfter = new Date(Math.max(Date.now(), fireMs))
    await enqueue(BOOKING_REMINDER_KIND, { bookingId }, { runAfter })
  } catch (err) {
    console.error('[booking-notify] schedule reminder failed', err)
  }
}

/** Send a cancellation notice to the member or guest (and the owner). Best-effort; never throws. */
export async function notifyBookingCancelled(
  ctx: Pick<
    BookingNotifyContext,
    | 'spaceId'
    | 'spaceSlug'
    | 'spaceName'
    | 'ownerProfileId'
    | 'memberProfileId'
    | 'memberName'
    | 'guest'
    | 'startsAt'
    | 'serviceName'
  > & {
    /** BOOK-008: the cancelled booking and its end, for the calendar file that removes it. Omitted, the
     *  booking is looked up by who booked it and when. */
    bookingId?: string | null
    endsAt?: string | null
  },
  reason: string | null,
): Promise<void> {
  try {
    const admin = createAdminClient()
    const tz = await bookingTimezone(admin, ctx.spaceId)
    const whenAbsolute = formatWhen(ctx.startsAt, tz)
    const bookUrl = `${APP_URL}/spaces/${ctx.spaceSlug}/book`

    // BOOK-008 / BOOK-014: name the service and remove the calendar event, even when the caller named neither.
    const found =
      ctx.bookingId && ctx.endsAt && ctx.serviceName ? null : await findCancelledBooking(admin, ctx)
    const bookingId = ctx.bookingId ?? (typeof found?.id === 'string' ? found.id : null)
    const endsAt = ctx.endsAt ?? (typeof found?.ends_at === 'string' ? found.ends_at : null)
    const serviceName = ctx.serviceName ?? (await serviceNameOf(admin, found?.service_type_id))

    const member = await bookerRecipient(admin, ctx)
    let icsBase64: string | null = null
    if (bookingId) {
      const invite = await inviteIdentity(admin, bookingId)
      icsBase64 = buildBookingIcsBase64({
        method: 'CANCEL',
        uid: invite.uid,
        // One past the invite it replaces, so the calendar takes the cancel over the last update.
        sequence: invite.sequence + 1,
        startsAt: ctx.startsAt,
        endsAt: endsAt ?? ctx.startsAt,
        summary: serviceName ?? `Session with ${ctx.spaceName}`,
        url: bookUrl,
        organizerName: ctx.spaceName,
        attendee: member,
        location: null,
      })
    }
    if (member) {
      await sendBookingCancelledEmail({
        to: member.email,
        recipientName: member.name,
        audience: 'member',
        recipientIsGuest: !!ctx.guest,
        spaceName: ctx.spaceName,
        serviceName,
        whenAbsolute,
        reason,
        bookUrl: ctx.guest?.manageUrl ?? bookUrl,
        icsBase64,
      })
    }
    if (ctx.ownerProfileId && ctx.ownerProfileId !== ctx.memberProfileId) {
      const owner = await resolveRecipient(admin, ctx.ownerProfileId)
      if (owner) {
        await sendBookingCancelledEmail({
          to: owner.email,
          recipientName: owner.name,
          audience: 'owner',
          spaceName: ctx.spaceName,
          serviceName,
          whenAbsolute,
          reason,
          bookUrl,
          icsBase64,
        })
      }
    }
  } catch (err) {
    console.error('[booking-notify] cancel failed', err)
  }
}

// ── outbox handler: the scheduled reminder ──────────────────────────────────────────────────────

/** The `booking_reminder` outbox handler. Re-reads the booking; a no-op unless it is still confirmed
 *  and in the future. Idempotent (a cancelled / rescheduled booking sends nothing). */
export async function runBookingReminder(payload: Record<string, unknown>): Promise<void> {
  const bookingId = typeof payload.bookingId === 'string' ? payload.bookingId : null
  if (!bookingId) return
  const admin = createAdminClient()

  // LIVE-835: read the guest columns too; a database without them falls back to the member-only read.
  const baseCols = 'id, space_id, member_profile_id, starts_at, ends_at, status'
  let read = await looseFrom(admin, 'space_bookings')
    .select(`${baseCols}, guest_name, guest_email`)
    .eq('id', bookingId)
    .maybeSingle()
  if (read.error) read = await looseFrom(admin, 'space_bookings').select(baseCols).eq('id', bookingId).maybeSingle()
  const booking = read.data as {
    id: string
    space_id: string
    member_profile_id: string | null
    guest_name?: string | null
    guest_email?: string | null
    starts_at: string
    ends_at: string
    status: string
  } | null
  if (!booking || booking.status !== 'confirmed') return // cancelled / rescheduled: nothing to send
  if (new Date(booking.starts_at).getTime() <= Date.now()) return // already started: skip

  const { data: spaceRow } = await admin
    .from('spaces')
    .select('name, brand_name, slug, domain')
    .eq('id', booking.space_id)
    .maybeSingle()
  const space = spaceRow as { name: string; brand_name: string | null; slug: string; domain: string | null } | null
  if (!space) return
  const spaceName = space.brand_name?.trim() || space.name

  const tz = await bookingTimezone(admin, booking.space_id)

  // A guest booker (LIVE-835) has no profile for the notification router's gate: the reminder is the
  // same transactional email, enqueued straight onto the outbox (sendRawEmail still honours global
  // suppression), and its link opens the Space website's Book page.
  if (!booking.member_profile_id) {
    if (!booking.guest_name || !booking.guest_email) return
    const { siteBookUrl } = await import('@/lib/sites/site-booking')
    await enqueueEmail(
      buildBookingReminderEmail({
        to: booking.guest_email,
        recipientName: booking.guest_name,
        spaceName,
        serviceName: null,
        whenAbsolute: formatWhen(booking.starts_at, tz),
        manageUrl: await siteBookUrl({ id: booking.space_id, slug: space.slug, domain: space.domain }),
      }),
    )
    return
  }

  const member = await resolveRecipient(admin, booking.member_profile_id)
  if (!member) return

  // Route through the notification registry (ADR-627): the 'booking.reminder' type is
  // transactional email, so the gate only weighs global suppression (no consent/pref) — the
  // same guard sendRawEmail applied before, now uniform + declarative. The email is rendered
  // from the existing template and handed to the router to transport durably.
  await routeNotification(
    'booking.reminder',
    { profileId: booking.member_profile_id, email: member.email },
    {
      email: buildBookingReminderEmail({
        to: member.email,
        recipientName: member.name,
        spaceName,
        serviceName: null,
        whenAbsolute: formatWhen(booking.starts_at, tz),
        manageUrl: `${APP_URL}/spaces/${space.slug}/book`,
      }),
    },
  )
}
