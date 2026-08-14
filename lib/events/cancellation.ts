import { createAdminClient } from '@/lib/supabase/admin'
import { refundTicket } from '@/lib/billing/tickets'
import { sendEventCancelledEmail, sendGuestEventCancelledEmail } from '@/lib/email'
import { shouldSend } from '@/lib/notification-preferences'

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
 *  Callers MUST invoke this only on the live → cancelled transition (guarding the
 *  update so a re-cancel returns zero rows), so it's not re-run (no double-email) on
 *  a repeated cancel. */
export async function refundAndNotifyForCancelledEvent(eventId: string): Promise<void> {
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
    .select('profile_id, guest_email, guest_name')
    .eq('event_id', eventId)
    .eq('status', 'going')

  // Two identities, two legs. `profile_id` is nullable since 20270303000000 and this cast used to
  // claim `string`, so a guest's NULL was passed straight into shouldSend() and resolveRecipient(),
  // both typed for a real id. The practical effect was worse than the type lie: a guest holding a
  // confirmed seat was NEVER TOLD the event was cancelled, even though we hold their address and it
  // is the only way to reach them. They would have turned up.
  const rsvpRows = (rsvpData ?? []) as unknown as {
    profile_id: string | null; guest_email: string | null; guest_name: string | null
  }[]
  const rsvpProfileIds = rsvpRows
    .map((r) => r.profile_id)
    .filter((id): id is string => typeof id === 'string')

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

  // ── 4. Notify signed-out guests. No shouldSend and no resolveRecipient: both key on a profile,
  // and a guest has neither a preferences row nor an auth.users record to read an address from —
  // the address IS the row. Suppression still applies, inside sendRawEmail at drain time.
  //
  // No dedupe against refundedBuyerIds is needed: a buyer is a member by construction (tickets
  // require an account), and capture_guest_rsvp refuses ticketed events outright, so these two
  // sets cannot intersect.
  for (const row of rsvpRows) {
    const guestEmail = row.guest_email
    if (!guestEmail) continue
    try {
      await sendGuestEventCancelledEmail({
        to: guestEmail,
        guestName: row.guest_name,
        eventTitle: event.title,
        whenAbsolute,
        eventUrl,
      })
    } catch (err) {
      console.error('[cancelEvent] notify (guest) failed', { eventId, err })
    }
  }
}
