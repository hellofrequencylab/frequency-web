import { createAdminClient } from '@/lib/supabase/admin'
import { refundTicket } from '@/lib/billing/tickets'
import { sendEventCancelledEmail, sendGuestEventCancelledEmail } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { enqueue, type JobHandler } from '@/lib/queue/outbox'
import { HOME_TZ, dayInZone, formatEventWhen, isEventPast } from '@/lib/time/zone'
import { cancelAudit } from './event-lifecycle'
import { isSeriesCadence, seriesKey, type SeriesRow } from './series'

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

// ── SERIES-CANCEL (LIVE-198 · EVENTS-SERIES-BUILD-PLAN §11.1) ─────────────────────────────────
//
// Recurrence is MATERIALISED (ADR-007): every date of a repeating event is its own `events` row
// carrying `parent_event_id`. Until now `cancel` only ever addressed ONE row, so "stop this series"
// was N separate operator actions, each independently flipping a flag and fanning out refunds.
// Measured on production 2026-09-07: 18 of 21 upcoming events are series children and two Spaces
// each carry a 9-occurrence series, so the honest cost of the missing action was nine irreversible
// money-moving clicks with no way to tell, mid-way, which ones had landed.
//
// FOUR RULINGS THIS CODE MAKES, because a bulk irreversible money path may not leave them implicit:
//
//   1. FUTURE ONLY. An occurrence that has already happened is never touched. Refunding a gathering
//      that took place is money out for value delivered, and it is not what "cancel this series"
//      means (the plan's own copy is "Cancel every date still to come"). "Already happened" is
//      isEventPast(starts_at, ends_at, time_zone) — the repo's ONE past predicate, which resolves
//      the stored wall clock through the event's own zone. It is NOT a `new Date()` compare against
//      `starts_at`: that column holds the host's wall clock kept as UTC PARTS, so a raw compare
//      drops tonight's 7pm gathering after 5pm Pacific (lib/time/zone.ts).
//
//   2. AN ALREADY-CANCELLED OCCURRENCE IS A NO-OP, NEVER A SECOND REFUND. Two guards, belt and
//      braces: the loop skips a row it read as cancelled, and the write itself is the same
//      `.eq('is_cancelled', false)` + `.select('id')` transition guard every single-event cancel
//      path uses — so a row someone else cancelled between our read and our write returns zero
//      rows and fans out nothing.
//
//   3. IDEMPOTENT under a double-click or a redelivered retry, by that same guard: the second run
//      flips zero rows and therefore enqueues zero refunds. UPDATE ... WHERE is_cancelled = false
//      is atomic per row in Postgres, so of two concurrent runs exactly one owns each flip.
//
//   4. THE FLIP IS PER-OCCURRENCE, NOT ONE BULK STATEMENT, AND THE RESULT IS REPORTED. This is
//      deliberate and it is the opposite of what "atomic" would suggest, for one reason: a bulk
//      flip that succeeds and then dies part-way through the fan-out leaves the remaining
//      occurrences cancelled with no refund queued, and ruling 2's guard then makes them
//      permanently unreachable — the exact LIVE-158 failure, at series scale. Flipping one row and
//      fanning it out before touching the next means a crash leaves later occurrences UNTOUCHED
//      and trivially retryable. One occurrence's failure never aborts the rest, and every
//      occurrence lands in exactly one bucket of SeriesCancelResult so the operator can see which
//      of the nine went through. Refunds themselves stay where LIVE-161 put them: one retried,
//      dead-lettered `ticket_refund` outbox job per succeeded ticket. Nothing here refunds inline.

/** Hard ceiling on the occurrences one series-cancel will consider. The recurrence cron keeps a
 *  60-day horizon warm, so a daily series is ~61 rows; a run that hits this cap sets `truncated`
 *  rather than silently doing half the job. */
export const MAX_SERIES_CANCEL = 400

/** The id is interpolated into a PostgREST `.or()` filter, so this is the sanitizer too (the same
 *  rule as lib/events/series-dates.ts and lib/events/circle-upcoming.ts). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface SeriesOccurrence {
  id: string
  slug: string | null
  startsAt: string | null
  endsAt: string | null
  timeZone: string | null
  isCancelled: boolean
}

export interface SeriesCancelPlan {
  /** parent_event_id ?? id — the one series key (lib/events/series.ts). */
  seriesKey: string | null
  /** True when this row really is part of a repeating event, so a caller can decide whether to
   *  offer the control at all. A one-off is a series of one and cancels fine, but showing a member
   *  or operator "cancel every date" on a single date is a lie. */
  recurring: boolean
  /** Occurrences that have not happened yet, earliest first, cancelled ones included. */
  upcoming: SeriesOccurrence[]
  /** Of `upcoming`, the ones a cancel would actually flip. This is the number a button may show. */
  cancellable: number
  truncated: boolean
}

export interface SeriesCancelResult {
  seriesKey: string | null
  /** Upcoming occurrences examined (past ones are never counted: they are out of scope, not skipped). */
  considered: number
  /** Flipped live → cancelled by THIS call, and therefore fanned out exactly once. */
  cancelled: string[]
  /** Already cancelled when we looked, or won by a concurrent cancel. No refund, no email. */
  alreadyCancelled: string[]
  /** Skipped because the caller may not edit that occurrence (a host transfer can split a series). */
  unauthorized: string[]
  /** The flip itself was refused. Nothing was cancelled and no money moved. */
  failed: { id: string; error: string }[]
  /** 🔴 Cancelled, but the refund/notify fan-out threw. Money is NOT queued for these and the
   *  transition guard means re-running will not retry them; countRefundsOwed on the event's Manage
   *  page is what still shows the outstanding refunds. Never empty silently — it is logged too. */
  fanoutFailed: string[]
  truncated: boolean
}

/** The SQL floor for the occurrence read. Deliberately two days BELOW the community's wall-clock
 *  day: `starts_at` is a wall clock in the event's OWN zone, which can sit up to ~14h either side
 *  of the home zone, and the precise "has it happened" call is made in JS by isEventPast. A floor
 *  that is merely wide costs a couple of rows; a floor that is tight drops a live date. */
function seriesReadFloor(now: Date): string {
  const day = dayInZone(now, HOME_TZ)
  const back = new Date(`${day}T00:00:00.000Z`)
  back.setUTCDate(back.getUTCDate() - 2)
  return back.toISOString()
}

/** Every occurrence of the series `eventId` belongs to that has not happened yet.
 *  THROWS on a failed read: an unreadable series must never look like a series with no dates —
 *  that reading would make a cancel silently do nothing and report success. */
export async function loadSeriesCancelPlan(
  eventId: string,
  now: Date = new Date(),
): Promise<SeriesCancelPlan> {
  const empty: SeriesCancelPlan = { seriesKey: null, recurring: false, upcoming: [], cancellable: 0, truncated: false }
  const admin = createAdminClient()

  const { data: seedRow, error: seedErr } = await admin
    .from('events')
    .select('id, starts_at, parent_event_id, recurrence_type')
    .eq('id', eventId)
    .maybeSingle()
  if (seedErr) throw new Error(`series cancel: event read failed: ${seedErr.message}`)
  if (!seedRow) return empty
  const seed = seedRow as SeriesRow & { recurrence_type: string | null }

  const key = seriesKey(seed)
  if (!UUID_RE.test(key)) return empty

  const { data, error } = await admin
    .from('events')
    .select('id, slug, starts_at, ends_at, time_zone, is_cancelled')
    // The anchor row itself OR any child of it. No listing gate: a private, unlisted or draft date
    // still has to be cancellable, and an already-cancelled one has to be VISIBLE here so it can be
    // reported as a no-op rather than quietly re-flipped.
    .or(`id.eq.${key},parent_event_id.eq.${key}`)
    .is('removed_at', null)
    .gte('starts_at', seriesReadFloor(now))
    .order('starts_at', { ascending: true })
    .limit(MAX_SERIES_CANCEL)
  if (error) throw new Error(`series cancel: occurrence read failed: ${error.message}`)

  const rows = (data ?? []) as Array<{
    id: string
    slug: string | null
    starts_at: string | null
    ends_at: string | null
    time_zone: string | null
    is_cancelled: boolean | null
  }>

  const upcoming: SeriesOccurrence[] = rows
    .filter((r) => r.id && !isEventPast(r.starts_at, r.ends_at, r.time_zone, now))
    .map((r) => ({
      id: r.id,
      slug: r.slug ?? null,
      startsAt: r.starts_at ?? null,
      endsAt: r.ends_at ?? null,
      timeZone: r.time_zone ?? null,
      isCancelled: r.is_cancelled === true,
    }))

  return {
    seriesKey: key,
    // A row is part of a series if it carries a parent, or it is an anchor with a real cadence, or
    // the read found siblings. The last arm covers an anchor whose cadence column was cleared but
    // whose children are still on the calendar.
    recurring: seed.parent_event_id != null || isSeriesCadence(seed.recurrence_type) || rows.length > 1,
    upcoming,
    cancellable: upcoming.filter((o) => !o.isCancelled).length,
    truncated: rows.length >= MAX_SERIES_CANCEL,
  }
}

/**
 * Cancel every date of a series that is still to come. See the four rulings above.
 *
 * `canCancel` is the caller's per-occurrence authorization. It is a CALLBACK rather than an import
 * so this module stays out of the viewer/session machinery, and it is asked PER OCCURRENCE rather
 * than once for the series because a host transfer or a scope move can split a series across two
 * owners — a caller who may edit tonight's date is not thereby entitled to cancel next month's.
 * Omitting it cancels whatever the series holds, so every exposed action must pass one.
 */
export async function cancelSeries(opts: {
  eventId: string
  actorProfileId: string | null
  reason?: string | null
  canCancel?: (occurrenceId: string) => Promise<boolean>
  now?: Date
}): Promise<SeriesCancelResult> {
  const now = opts.now ?? new Date()
  const plan = await loadSeriesCancelPlan(opts.eventId, now)
  const admin = createAdminClient()

  const result: SeriesCancelResult = {
    seriesKey: plan.seriesKey,
    considered: plan.upcoming.length,
    cancelled: [],
    alreadyCancelled: [],
    unauthorized: [],
    failed: [],
    fanoutFailed: [],
    truncated: plan.truncated,
  }

  for (const occ of plan.upcoming) {
    // Ruling 2, first guard: a date we read as cancelled is skipped before any write, so its
    // tickets are never re-enqueued for refund.
    if (occ.isCancelled) {
      result.alreadyCancelled.push(occ.id)
      continue
    }
    if (opts.canCancel && !(await opts.canCancel(occ.id))) {
      result.unauthorized.push(occ.id)
      continue
    }

    // Ruling 2, second guard + ruling 3: the transition guard. Zero rows back means somebody else
    // owns this cancellation, so we fan nothing out.
    const { data: flipped, error } = await admin
      .from('events')
      .update(cancelAudit(opts.actorProfileId, opts.reason ?? null))
      .eq('id', occ.id)
      .eq('is_cancelled', false)
      .select('id')
    if (error) {
      result.failed.push({ id: occ.id, error: error.message })
      console.error('[cancelSeries] flip failed', { seriesKey: plan.seriesKey, occurrence: occ.id, error: error.message })
      continue
    }
    if ((flipped ?? []).length === 0) {
      result.alreadyCancelled.push(occ.id)
      continue
    }

    result.cancelled.push(occ.id)
    // Ruling 4: fan out THIS date before touching the next, and never let its failure abort the
    // loop. refundAndNotifyForCancelledEvent enqueues one `ticket_refund` outbox job per succeeded
    // ticket (LIVE-161) — no Stripe call happens on this thread.
    try {
      await refundAndNotifyForCancelledEvent(occ.id)
    } catch (err) {
      result.fanoutFailed.push(occ.id)
      console.error('[cancelSeries] refund/notify fan-out failed AFTER the cancel landed', {
        seriesKey: plan.seriesKey,
        occurrence: occ.id,
        err,
      })
    }
  }

  console.warn('[cancelSeries] done', {
    seriesKey: result.seriesKey,
    considered: result.considered,
    cancelled: result.cancelled.length,
    alreadyCancelled: result.alreadyCancelled.length,
    unauthorized: result.unauthorized.length,
    failed: result.failed.length,
    fanoutFailed: result.fanoutFailed.length,
    truncated: result.truncated,
  })
  return result
}
