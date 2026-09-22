// ── `import 'server-only'` IS THE POINT OF THE LINE BELOW, NOT DECORATION (LIVE-037) ──────────
// The header below says these are "Pure reads on the service-role client". A comment enforces
// nothing: event-core-stats.tsx imported the formatter from here and carried the admin client
// into the browser graph with it. The directive makes that a BUILD FAILURE, by importer name.
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// The ONE core-stats read for an event (EVENTS-REWORK, item 13). Both the host Manage
// dashboard (app/(main)/events/[slug]/manage) and the in-rail Event settings editor
// (components/admin/modules/event-settings-module) render the SAME headline numbers, so
// the read + the money formatter live here once and both surfaces compose the shared
// <EventCoreStatsCards> (components/events/event-core-stats) over this shape. No StatCard
// row is hand-rolled on either side.
//
// Pure reads on the service-role client; every caller authorizes the viewer as
// host/cohost (event.editSettings) BEFORE reading. Derived from the same ledgers the
// rest of the event surfaces use: succeeded event_tickets (sold + revenue), event_rsvps
// (going / interested / waitlist), the append-only check-in ledger, and events.capacity.

// The shape + the money formatter live in ./event-stats-core (dependency-free) so the card
// row can render them without dragging this module's admin client into the browser (LIVE-037).
// Re-exported here so every existing server caller is unchanged.
export type { EventCoreStats } from './event-stats-core'
export { formatEventMoney } from './event-stats-core'
import type { EventCoreStats } from './event-stats-core'
import { attendanceCount, sumAttendance, type AttendedRsvpRow, type AttendedTicketRow } from './attendance'

interface TicketRow {
  amount_cents: number | null
  qty: number | null
  status: string
}

/** Read the core headline stats for one event. Callers gate on event.editSettings first. */
export async function loadEventCoreStats(eventId: string): Promise<EventCoreStats> {
  const admin = createAdminClient()
  const [evRes, ticketsRes, rsvpsRes, checkinRes] = await Promise.all([
    admin.from('events').select('capacity, currency, price_cents').eq('id', eventId).maybeSingle(),
    admin.from('event_tickets').select('amount_cents, qty, status').eq('event_id', eventId),
    admin.from('event_rsvps').select('status').eq('event_id', eventId),
    admin
      .from('engagement_events')
      .select('actor_profile_id')
      .eq('event_type', 'practice.verified')
      .like('idempotency_key', `event_checkin:${eventId}:%`),
  ])

  const ev = evRes.data as { capacity: number | null; currency: string | null; price_cents: number | null } | null
  const tickets = (ticketsRes.data ?? []) as TicketRow[]
  const succeeded = tickets.filter((t) => t.status === 'succeeded')
  const sold = succeeded.reduce((sum, t) => sum + (t.qty ?? 1), 0)
  const revenueCents = succeeded.reduce((sum, t) => sum + (t.amount_cents ?? 0), 0)

  const rsvps = (rsvpsRes.data ?? []) as { status: string }[]
  const going = rsvps.filter((r) => r.status === 'going').length
  const interested = rsvps.filter((r) => r.status === 'maybe').length
  const waitlist = rsvps.filter((r) => r.status === 'waitlist').length

  const checkedIn = new Set(
    ((checkinRes.data ?? []) as { actor_profile_id: string | null }[])
      .map((r) => r.actor_profile_id)
      .filter((v): v is string => !!v),
  ).size

  const priceCents = ev?.price_cents ?? null
  const paid = (priceCents != null && priceCents > 0) || tickets.length > 0

  return {
    sold,
    revenueCents,
    currency: ev?.currency ?? 'usd',
    going,
    interested,
    waitlist,
    checkedIn,
    capacity: typeof ev?.capacity === 'number' ? ev.capacity : null,
    paid,
  }
}

/**
 * THE ATTENDANCE RECORD FOR A PLAN'S EVENTS (PROG-CAL6): how many people came, or null when no
 * event in the list carries a mark or a check-in. The same three ledgers the core stats above
 * read (event_rsvps, succeeded unrefunded event_tickets, the check-in ledger), folded by the one
 * rule in lib/events/attendance.ts so the Plan recap and the Manage roster count alike.
 *
 * Callers authorize FIRST and hand in event ids they have already proven belong to their Space:
 * this read is scoped to the ids it is given and nothing else, and it is a read of headline
 * numbers, never of who the people are. Fail-safe to null (the recap then says the record is
 * empty), never a throw, because a recap is a proposal and not a gate.
 */
export async function loadPlanAttendance(eventIds: readonly string[]): Promise<number | null> {
  const ids = [...new Set(eventIds.filter(Boolean))].slice(0, 50)
  if (ids.length === 0) return null
  try {
    const admin = createAdminClient()
    // The check-in ledger keys on `event_checkin:<event>:<profile>`, a prefix per event, so it is
    // read per event with the same `like` the roster uses (app/(main)/events/[slug]/manage/load.ts).
    const [rsvpRes, ticketRes, checkins] = await Promise.all([
      admin.from('event_rsvps').select('id, event_id, profile_id, attended_at').in('event_id', ids),
      admin
        .from('event_tickets')
        .select('id, event_id, buyer_profile_id, attended_at')
        .in('event_id', ids)
        .eq('status', 'succeeded')
        .is('refunded_at', null),
      Promise.all(
        ids.map((eventId) =>
          admin
            .from('engagement_events')
            .select('actor_profile_id')
            .eq('event_type', 'practice.verified')
            .like('idempotency_key', `event_checkin:${eventId}:%`),
        ),
      ),
    ])
    const rsvps = (rsvpRes.data ?? []) as (AttendedRsvpRow & { event_id: string })[]
    const tickets = (ticketRes.data ?? []) as (AttendedTicketRow & { event_id: string })[]
    return sumAttendance(
      ids.map((eventId, i) =>
        attendanceCount({
          rsvps: rsvps.filter((r) => r.event_id === eventId),
          tickets: tickets.filter((t) => t.event_id === eventId),
          checkedInProfileIds: ((checkins[i]?.data ?? []) as { actor_profile_id: string | null }[])
            .map((r) => r.actor_profile_id)
            .filter((v): v is string => !!v),
        }),
      ),
    )
  } catch {
    return null
  }
}
