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

import { createAdminClient } from '@/lib/supabase/admin'
import { enqueue } from '@/lib/queue/outbox'
import { routeNotification } from '@/lib/notifications/router'
import {
  sendBookingConfirmationEmail,
  buildBookingReminderEmail,
  sendBookingCancelledEmail,
} from '@/lib/email'

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
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>
}
function looseFrom(admin: Admin, table: string): LooseQuery {
  return (admin as unknown as { from: (t: string) => LooseQuery }).from(table)
}

/** The context a caller (createBooking / rescheduleBooking) already holds, so confirmation mail needs
 *  no re-read of the just-written row. */
export interface BookingNotifyContext {
  bookingId: string
  spaceId: string
  spaceSlug: string
  spaceName: string
  ownerProfileId: string | null
  memberProfileId: string
  memberName: string | null
  startsAt: string
  endsAt: string
  serviceName: string | null
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

/** A single-event VCALENDAR for a booking, as a base64 string ready to attach. Pure. */
export function buildBookingIcsBase64(params: {
  uid: string
  startsAt: string
  endsAt: string
  summary: string
  url: string
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Frequency//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${params.uid}@frequency`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(new Date(params.startsAt))}`,
    `DTEND:${icsStamp(new Date(params.endsAt))}`,
    `SUMMARY:${icsEscape(params.summary)}`,
    `URL:${icsEscape(params.url)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  const body = lines.join('\r\n') + '\r\n'
  return Buffer.from(body, 'utf-8').toString('base64')
}

/** The Space's booking timezone label source: the schedule tz, else the first window tz, else UTC. */
async function bookingTimezone(admin: Admin, spaceId: string): Promise<string> {
  try {
    const { data: sched } = await looseFrom(admin, 'space_availability_schedules')
      .select('timezone')
      .eq('space_id', spaceId)
      .eq('active', true)
      .limit(1)
      .maybeSingle()
    const tz = (sched as { timezone?: string } | null)?.timezone
    if (tz) return tz
  } catch {
    /* fall through */
  }
  try {
    const { data: win } = await looseFrom(admin, 'space_availability')
      .select('timezone')
      .eq('space_id', spaceId)
      .limit(1)
      .maybeSingle()
    return (win as { timezone?: string } | null)?.timezone || 'UTC'
  } catch {
    return 'UTC'
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
    const icsBase64 = buildBookingIcsBase64({
      uid: ctx.bookingId,
      startsAt: ctx.startsAt,
      endsAt: ctx.endsAt,
      summary: ctx.serviceName ?? `Session with ${ctx.spaceName}`,
      url: manageUrl,
    })

    const member = await resolveRecipient(admin, ctx.memberProfileId)
    if (member) {
      await sendBookingConfirmationEmail({
        to: member.email,
        recipientName: member.name,
        audience: 'member',
        spaceName: ctx.spaceName,
        serviceName: ctx.serviceName,
        whenAbsolute,
        durationMinutes: mins,
        otherPartyName: ctx.spaceName,
        manageUrl,
        icsBase64,
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
          otherPartyName: ctx.memberName ?? member?.name ?? 'A member',
          manageUrl,
          icsBase64,
        })
      }
    }
  } catch (err) {
    console.error('[booking-notify] confirm failed', err)
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

/** Send a cancellation notice to the member (and the owner). Best-effort; never throws. */
export async function notifyBookingCancelled(
  ctx: Pick<
    BookingNotifyContext,
    'spaceId' | 'spaceSlug' | 'spaceName' | 'ownerProfileId' | 'memberProfileId' | 'memberName' | 'startsAt' | 'serviceName'
  >,
  reason: string | null,
): Promise<void> {
  try {
    const admin = createAdminClient()
    const tz = await bookingTimezone(admin, ctx.spaceId)
    const whenAbsolute = formatWhen(ctx.startsAt, tz)
    const bookUrl = `${APP_URL}/spaces/${ctx.spaceSlug}/book`

    const member = await resolveRecipient(admin, ctx.memberProfileId)
    if (member) {
      await sendBookingCancelledEmail({
        to: member.email,
        recipientName: member.name,
        audience: 'member',
        spaceName: ctx.spaceName,
        serviceName: ctx.serviceName,
        whenAbsolute,
        reason,
        bookUrl,
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
          serviceName: ctx.serviceName,
          whenAbsolute,
          reason,
          bookUrl,
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

  const { data: bookingRow } = await looseFrom(admin, 'space_bookings')
    .select('id, space_id, member_profile_id, starts_at, ends_at, status')
    .eq('id', bookingId)
    .maybeSingle()
  const booking = bookingRow as {
    id: string
    space_id: string
    member_profile_id: string
    starts_at: string
    ends_at: string
    status: string
  } | null
  if (!booking || booking.status !== 'confirmed') return // cancelled / rescheduled: nothing to send
  if (new Date(booking.starts_at).getTime() <= Date.now()) return // already started: skip

  const { data: spaceRow } = await admin
    .from('spaces')
    .select('name, brand_name, slug')
    .eq('id', booking.space_id)
    .maybeSingle()
  const space = spaceRow as { name: string; brand_name: string | null; slug: string } | null
  if (!space) return
  const spaceName = space.brand_name?.trim() || space.name

  const member = await resolveRecipient(admin, booking.member_profile_id)
  if (!member) return

  const tz = await bookingTimezone(admin, booking.space_id)
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
