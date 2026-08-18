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
