// A WEBSITE GUEST MANAGES THEIR OWN BOOKING (BOOK-007). A guest who booked on a Space website (LIVE-835) has
// no Frequency account, so the member paths (cancelBooking / rescheduleBooking, which ask who is signed in)
// can never reach their booking. Their confirmation and reminder emails instead link to a small manage page
// (`/manage-booking?token=...` on the website, or /spaces/<slug>/manage-booking on Frequency when the
// website is not published), where they cancel or move it.
//
// THE SECRET is the booking's existing guest_confirm_token (SCAN-834): 24 random bytes, minted for the hold,
// kept after the click, and unique. No column is added. It is compared on the server only, and nothing here
// returns it to the browser beyond the URL the guest already holds. A move hands the token to the new booking
// (cleared on the old one first, because the token is unique), so every email the guest has keeps working.
//
// WRITES ARE POSTS (SCAN-858). Opening the link only reads. Cancel and Reschedule are server actions the page's
// buttons post, rate limited per IP at the action door (lib/spaces/booking-actions.ts), so a mail scanner
// that opens every link changes nothing.
//
// SAME RULES AS A MEMBER. The Space's minimum notice (withinModifyWindow) gates both actions, a move acquires
// the new time first through the same validated core a member's booking uses (validateAndPlaceBooking), and a
// cancel stamps cancelled_at and the reason and sends the same cancellation notice (notifyBookingCancelled).
//
// authz-ok: the caller is anonymous by design. Every read and write here is bound to the row the guest's
// secret names, and to the Space the page that posted it belongs to.

import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceById } from '@/lib/spaces/store'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import {
  afterBookingPlaced,
  bookerFromRow,
  getPublicSpaceBookingTimezone,
  listPublicOpenSlots,
  parseAnswers,
  readSchedule,
  validateAndPlaceBooking,
  withinModifyWindow,
  type OpenSlot,
} from '@/lib/spaces/booking'

// ── the row the secret names ────────────────────────────────────────────────────────────────────

type ManagedRow = {
  id: string
  space_id: string
  member_profile_id: string | null
  guest_name?: string | null
  guest_email?: string | null
  starts_at: string
  ends_at: string
  status: string
  note: string | null
  answers?: unknown
  service_type_id?: string | null
  guest_confirm_token?: string | null
}

type Loose = {
  select: (cols: string) => Loose
  eq: (col: string, val: unknown) => Loose
  update: (patch: Record<string, unknown>) => Loose
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>
}
function table(name: string): Loose {
  return (createAdminClient() as unknown as { from: (t: string) => Loose }).from(name)
}

const MANAGED_COLS =
  'id, space_id, member_profile_id, guest_name, guest_email, starts_at, ends_at, status, note, answers, service_type_id, guest_confirm_token'

/** The secret as the link carries it, or null when it cannot be one (the mint is randomBytes(24).base64url). */
export function cleanManageToken(raw: unknown): string | null {
  const token = typeof raw === 'string' ? raw.trim() : ''
  if (!token || token.length > 64 || !/^[A-Za-z0-9_-]+$/.test(token)) return null
  return token
}

async function readRowByToken(token: string): Promise<ManagedRow | null> {
  try {
    const res = await table('space_bookings').select(MANAGED_COLS).eq('guest_confirm_token', token).maybeSingle()
    return res.error ? null : ((res.data as ManagedRow | null) ?? null)
  } catch {
    return null
  }
}

type ManagedSpace = NonNullable<Awaited<ReturnType<typeof getSpaceById>>>

/** The guest booking a secret names on this Space, or null. A member's booking, a token for another Space,
 *  or a malformed token all read as null, so the page says only that the link did not work. */
async function resolveManaged(
  rawToken: unknown,
  expectedSpaceId: string,
): Promise<{ token: string; row: ManagedRow; space: ManagedSpace; guestName: string; guestEmail: string } | null> {
  const token = cleanManageToken(rawToken)
  if (!token || !expectedSpaceId) return null
  const row = await readRowByToken(token)
  if (!row || row.space_id !== expectedSpaceId) return null
  const booker = bookerFromRow(row)
  if (!booker || 'profileId' in booker) return null
  const space = await getSpaceById(row.space_id)
  if (!space || space.id !== expectedSpaceId) return null
  return { token, row, space, guestName: booker.guestName, guestEmail: booker.guestEmail }
}

/** A service's name, active or not (a guest still sees what they booked after the owner retires it). */
async function serviceNameOf(serviceTypeId: string | null | undefined): Promise<string | null> {
  if (!serviceTypeId) return null
  try {
    const { data } = await table('space_service_types').select('name').eq('id', serviceTypeId).maybeSingle()
    const name = (data as { name?: unknown } | null)?.name
    return typeof name === 'string' && name.trim() ? name.trim() : null
  } catch {
    return null
  }
}

/** The answers map validateAndPlaceBooking expects, rebuilt from the stored labeled answers, so a move
 *  carries them (the move asks no questions again). Null when there are none. */
function answersMap(raw: unknown): Record<string, string> | null {
  const parsed = parseAnswers(raw)
  if (parsed.length === 0) return null
  return Object.fromEntries(parsed.map((a) => [a.id, a.value]))
}

function spaceLabel(space: ManagedSpace): string {
  return space.brandName?.trim() || space.name
}

// ── the manage page's read ──────────────────────────────────────────────────────────────────────

/** What the manage page shows. `awaiting` is a hold the guest never confirmed; `past` a time already
 *  started; `canModify` is false inside the Space's minimum notice. */
export type GuestManageView =
  | {
      ok: true
      state: 'upcoming' | 'cancelled' | 'past' | 'awaiting'
      canModify: boolean
      spaceName: string
      startsAt: string
      endsAt: string
      serviceName: string | null
      timezone: string
    }
  | { ok: false }

/** The guest's booking for the manage page. Reads only: opening the link changes nothing (SCAN-858). */
export async function readGuestManagedBooking(rawToken: unknown, expectedSpaceId: string): Promise<GuestManageView> {
  const found = await resolveManaged(rawToken, expectedSpaceId)
  if (!found) return { ok: false }
  const { row, space } = found
  const started = new Date(row.starts_at).getTime() <= Date.now()
  const state: 'upcoming' | 'cancelled' | 'past' | 'awaiting' =
    row.status === 'cancelled'
      ? 'cancelled'
      : row.status === 'pending'
        ? 'awaiting'
        : row.status === 'confirmed' && !started
          ? 'upcoming'
          : 'past'
  const [serviceName, timezone, schedule] = await Promise.all([
    serviceNameOf(row.service_type_id),
    getPublicSpaceBookingTimezone(space.id),
    readSchedule(space.id),
  ])
  return {
    ok: true,
    state,
    canModify: state === 'upcoming' && withinModifyWindow(row.starts_at, schedule.minNoticeMinutes),
    spaceName: spaceLabel(space),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    serviceName,
    timezone,
  }
}

/** The open times the guest may move to: the same service's, minus their own current time. FAIL-SAFE to []. */
export async function listGuestRescheduleSlots(rawToken: unknown, expectedSpaceId: string): Promise<OpenSlot[]> {
  const found = await resolveManaged(rawToken, expectedSpaceId)
  if (!found || found.row.status !== 'confirmed') return []
  const own = new Date(found.row.starts_at).getTime()
  const slots = await listPublicOpenSlots(found.space.id, found.row.service_type_id ?? null)
  return slots.filter((s) => new Date(s.startsAt).getTime() !== own)
}

/** Why a guest may not change this booking right now, or null when they may. */
async function modifyRefusal(row: ManagedRow, verb: 'cancel' | 'move', spaceName: string): Promise<string | null> {
  if (row.status !== 'confirmed') return `This booking cannot be ${verb === 'cancel' ? 'cancelled' : 'moved'} now.`
  if (new Date(row.starts_at).getTime() <= Date.now()) return 'This time has already started.'
  const schedule = await readSchedule(row.space_id)
  if (!withinModifyWindow(row.starts_at, schedule.minNoticeMinutes))
    return `This booking is too close to its start time to ${verb} here. Contact ${spaceName} directly.`
  return null
}

// ── cancel ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Cancel a guest's booking from their manage page (BOOK-007). Same effect as a member's cancel: status
 * cancelled, cancelled_at and the reason stamped, the slot freed, and the cancellation notice to the guest and
 * the owner. Compare-and-set on (id, confirmed), so a double press cancels and mails once. A booking already
 * cancelled answers success without mailing again.
 */
export async function cancelGuestBookingByToken(
  rawToken: unknown,
  expectedSpaceId: string,
  reason?: string | null,
): Promise<ActionResult> {
  const found = await resolveManaged(rawToken, expectedSpaceId)
  if (!found) return fail('That link did not work. Check the latest email about your booking.')
  const { row, space } = found
  if (row.status === 'cancelled') return ok()
  const refusal = await modifyRefusal(row, 'cancel', spaceLabel(space))
  if (refusal) return fail(refusal)

  const cleanReason = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 500) : null
  const now = new Date().toISOString()
  let flipped = false
  try {
    let res = await table('space_bookings')
      .update({ status: 'cancelled', cancelled_at: now, cancel_reason: cleanReason })
      .eq('id', row.id)
      .eq('status', 'confirmed')
      .select('id')
      .maybeSingle()
    // A database without the P3 lifecycle columns: flip the status alone, as cancelBooking does.
    if (res.error) {
      res = await table('space_bookings')
        .update({ status: 'cancelled' })
        .eq('id', row.id)
        .eq('status', 'confirmed')
        .select('id')
        .maybeSingle()
      if (res.error) return fail('Could not cancel the booking. Try again.')
    }
    flipped = !!res.data
  } catch {
    return fail('Could not cancel the booking. Try again.')
  }
  if (!flipped) return ok() // a second press, or the owner cancelled first

  try {
    const [{ notifyBookingCancelled }, { siteBookUrl }, serviceName] = await Promise.all([
      import('@/lib/spaces/booking-notify'),
      import('@/lib/sites/site-booking'),
      serviceNameOf(row.service_type_id),
    ])
    await notifyBookingCancelled(
      {
        bookingId: row.id,
        spaceId: space.id,
        spaceSlug: space.slug,
        spaceName: spaceLabel(space),
        ownerProfileId: space.ownerProfileId,
        memberProfileId: null,
        memberName: found.guestName,
        // The cancellation's one button books another time, so it opens the Book page.
        guest: { name: found.guestName, email: found.guestEmail, manageUrl: await siteBookUrl(space) },
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        serviceName,
      },
      cleanReason,
    )
  } catch {
    /* fail-soft: the booking is already cancelled */
  }
  return ok()
}

// ── reschedule ─────────────────────────────────────────────────────────────────────────────────

/**
 * Move a guest's booking to another open time of the same service (BOOK-007). The new time is acquired
 * FIRST through validateAndPlaceBooking (the same slot rules and unique-index guard as any booking, linked by
 * rescheduled_from), and only then is the old one cancelled, so a race never frees the old time and loses the
 * new one. The guest's secret moves to the new booking, and the confirmation and reminder go out for it.
 */
export async function rescheduleGuestBookingByToken(
  rawToken: unknown,
  expectedSpaceId: string,
  newStartsAtISO: unknown,
): Promise<ActionResult<{ startsAt: string }>> {
  const found = await resolveManaged(rawToken, expectedSpaceId)
  if (!found) return fail('That link did not work. Check the latest email about your booking.')
  const { token, row, space } = found
  const refusal = await modifyRefusal(row, 'move', spaceLabel(space))
  if (refusal) return fail(refusal)
  const target = typeof newStartsAtISO === 'string' ? new Date(newStartsAtISO) : null
  if (!target || Number.isNaN(target.getTime())) return fail('Pick a valid time.')
  if (target.getTime() === new Date(row.starts_at).getTime()) return fail('That is already your time. Pick another.')

  const placed = await validateAndPlaceBooking({
    space,
    booker: { guestName: found.guestName, guestEmail: found.guestEmail },
    startsAtISO: target.toISOString(),
    note: row.note,
    serviceTypeId: row.service_type_id ?? null,
    answers: answersMap(row.answers),
    rescheduledFrom: row.id,
  })
  if (!placed.ok) return fail(placed.error)

  // New time held. Release the old one and clear its secret (the token is unique), then hand the secret to
  // the new booking. Fail-soft: the new booking already stands, and without the secret its email links to
  // the Book page instead.
  const now = new Date().toISOString()
  try {
    const res = await table('space_bookings')
      .update({ status: 'cancelled', cancelled_at: now, guest_confirm_token: null })
      .eq('id', row.id)
      .select('id')
      .maybeSingle()
    if (res.error) {
      await table('space_bookings').update({ status: 'cancelled', guest_confirm_token: null }).eq('id', row.id).select('id').maybeSingle()
    }
  } catch {
    /* fail-soft */
  }
  try {
    await table('space_bookings')
      .update({ guest_confirm_token: token, guest_confirmed_at: now })
      .eq('id', placed.bookingId)
      .select('id')
      .maybeSingle()
  } catch {
    /* fail-soft */
  }

  try {
    await afterBookingPlaced(space, placed)
  } catch {
    /* fail-soft: mail and reminder are best-effort */
  }
  return ok({ startsAt: placed.startsAt })
}

// ── the link a guest's emails carry ─────────────────────────────────────────────────────────────

/** The manage page URL for a guest booking (the link in its confirmation and reminder), or null when the
 *  booking carries no secret (a guest booking from before SCAN-834). */
export async function guestManageUrlForBooking(
  space: { id: string; slug: string; domain?: string | null },
  bookingId: string,
): Promise<string | null> {
  let token: string | null = null
  try {
    const { data } = await table('space_bookings').select('guest_confirm_token').eq('id', bookingId).maybeSingle()
    token = cleanManageToken((data as { guest_confirm_token?: unknown } | null)?.guest_confirm_token)
  } catch {
    token = null
  }
  if (!token) return null
  const { siteManageBookingUrl } = await import('@/lib/sites/site-booking')
  return siteManageBookingUrl(space, token)
}
