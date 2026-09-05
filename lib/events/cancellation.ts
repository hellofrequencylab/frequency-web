import { createAdminClient } from '@/lib/supabase/admin'
import { refundTicket } from '@/lib/billing/tickets'
import { sendEventCancelledEmail, sendGuestEventCancelledEmail } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { enqueue, type JobHandler } from '@/lib/queue/outbox'
import { formatEventWhen } from '@/lib/time/zone'

// ── The refund is a QUEUED job, not an inline call (scan2 L6-04, LIVE-158) ─────────────────────
// Until 2026-09-05 refundAndNotifyForCancelledEvent called refundTicket() in a loop, after the
// cancel flip had already committed. A Stripe error, a connected-account balance short of the
// refund, or a crash mid-loop left the buyer charged for a cancelled event, the ticket row
// `succeeded`, and nothing queued: the firstCancel guard makes a second cancel a no-op, so there
// was no way to retry short of the Stripe dashboard. Now cancellation enqueues ONE outbox job per
// succeeded ticket and the drain (lib/queue/handlers.ts) runs runTicketRefund, which is
// idempotent (refundTicket returns ok on an already-refunded ticket without touching Stripe) and
// THROWS on a processor error so the outbox's own retry + dead-letter covers it. The Manage page
// reads countRefundsOwed to show what is still outstanding.

export const TICKET_REFUND_KIND = 'ticket_refund'

/** Outbox handler for `ticket_refund`. payload: { ticketId, eventId }. A ticket already refunded
 *  is a clean no-op; a processor refusal throws so the job retries and, past the cap, dead-letters
 *  onto the operator surface instead of vanishing. Never marks a failed refund done. */
export const runTicketRefund: JobHandler = async (payload) => {
  const ticketId = typeof payload.ticketId === 'string' ? payload.ticketId : ''
  const eventId = typeof payload.eventId === 'string' ? payload.eventId : ''
  if (!ticketId || !eventId) throw new Error('ticket_refund job missing ticketId or eventId')
  const r = await refundTicket(ticketId, eventId)
  if (r.error) throw new Error(`ticket_refund: ${r.error}`)
}

/** How many succeeded tickets a CANCELLED event still holds, i.e. refunds still owed. Zero for a
 *  live event, and zero (logged) on a failed read so the number is never invented. */
export async function countRefundsOwed(eventId: string): Promise<number> {
  const admin = createAdminClient()
  const { data: ev, error: evErr } = await admin
    .from('events')
    .select('is_cancelled')
    .eq('id', eventId)
    .maybeSingle()
  if (evErr) {
    console.error('[cancelEvent] refunds-owed event read failed', { eventId, error: evErr.message })
    return 0
  }
  if (!ev?.is_cancelled) return 0
  const { count, error } = await admin
    .from('event_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'succeeded')
  if (error) {
    console.error('[cancelEvent] refunds-owed count failed', { eventId, error: error.message })
    return 0
  }
  return count ?? 0
}

interface CancelTicketRow {
  id: string
  buyer_profile_id: string | null
}

interface CancelEventMeta {
  title: string
  slug: string
  starts_at: string
  time_zone: string | null
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
 *  a repeated cancel.
 *
 *  2026-09-05 (scan2 L6-04): the second bullet is retired. Refunds no longer run here at all;
 *  each succeeded ticket becomes one `ticket_refund` outbox job (see the header), so a failure
 *  is retried by the drain rather than "logged + collected" and forgotten. The buyer email is
 *  still enqueued here, per buyer, exactly as before. */
export async function refundAndNotifyForCancelledEvent(eventId: string): Promise<void> {
  const admin = createAdminClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

  const { data: eventData } = await admin
    .from('events')
    .select('title, slug, starts_at, time_zone')
    .eq('id', eventId)
    .maybeSingle()
  const event = eventData as CancelEventMeta | null
  if (!event) return
  const eventUrl = `${appUrl}/events/${event.slug}`
  // The when-line goes into an email, so the LABEL has to be true, not just the digits.
  // starts_at holds the host's wall clock as UTC parts (lib/time/zone.ts), and the old local
  // formatter labelled those parts "UTC" — a 7pm Pacific event read "7:00 PM UTC", so anyone who
  // converted it landed seven hours out. The shared formatter renders the same wall clock and
  // labels it with the event's OWN zone abbrev.
  const whenAbsolute = formatEventWhen(event.starts_at, event.time_zone)

  // ── 1. Refund every succeeded ticket (idempotent + frees inventory) ──────────
  // `event_tickets` isn't in the generated DB types yet → untyped-client cast
  // (the lib/billing/* convention).
  // 2026-09-05 (scan2 L6-04): event_tickets IS in lib/database.types.ts now; the cast below is
  // harmless and left as is. "refund" here now means "enqueue the refund job". The read is
  // checked for its error: a failed read must not look like an event with no tickets.
  const { data: ticketData, error: ticketErr } = await (admin)
    .from('event_tickets')
    .select('id, buyer_profile_id')
    .eq('event_id', eventId)
    .eq('status', 'succeeded')
  if (ticketErr) console.error('[cancelEvent] ticket read failed', { eventId, error: ticketErr.message })
  const tickets = (ticketData ?? []) as CancelTicketRow[]

  const refundedBuyerIds = new Set<string>()
  const failures: { ticketId: string; error: string }[] = []

  for (const ticket of tickets) {
    try {
      await enqueue(TICKET_REFUND_KIND, { ticketId: ticket.id, eventId })
      if (ticket.buyer_profile_id) refundedBuyerIds.add(ticket.buyer_profile_id)
    } catch (err) {
      // enqueue throws when the outbox insert is refused. The ticket stays `succeeded`, so it
      // still shows on the Manage page as a refund owed; nothing here pretends otherwise.
      failures.push({ ticketId: ticket.id, error: String(err) })
      console.error('[cancelEvent] refund enqueue failed', { eventId, ticketId: ticket.id, err })
    }
  }

  if (failures.length) {
    console.error('[cancelEvent] refund enqueue summary', {
      eventId,
      total: tickets.length,
      queued: tickets.length - failures.length,
      failed: failures.length,
    })
  }

  // ── 2. Notify refunded buyers (best-effort, never blocks/rolls back a refund) ─
  // Both legs below gate through the ONE seam (ADR-169), not the bare preference read they used:
  // that read skipped suppression, so a bounced address was still written to (meta-scan B9 H6).
  // The address is resolved first so suppression can see it. No subject: a cancellation of an
  // event the member RSVP'd to is about their own seat, not a Circle they may have muted.
  for (const buyerId of refundedBuyerIds) {
    try {
      const recipient = await resolveRecipient(admin, buyerId)
      if (!recipient) continue
      if (!(await resolveSendGate(buyerId, 'email', 'events', { email: recipient.email })).allowed) continue
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
      const recipient = await resolveRecipient(admin, profileId)
      if (!recipient) continue
      if (!(await resolveSendGate(profileId, 'email', 'events', { email: recipient.email })).allowed) continue
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
