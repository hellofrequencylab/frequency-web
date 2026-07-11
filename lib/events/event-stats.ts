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

/** The core set every event surface leads with: Sold · Revenue · Going · Interested ·
 *  Waitlist · Checked in · Capacity. */
export interface EventCoreStats {
  /** Tickets sold (sum of qty on succeeded event_tickets). */
  sold: number
  /** Gross ticket revenue, minor units, on succeeded event_tickets. */
  revenueCents: number
  currency: string
  /** Confirmed 'going' RSVP rows. */
  going: number
  /** 'maybe' RSVP rows (shown as "Interested" per the naming canon). */
  interested: number
  /** 'waitlist' RSVP rows. */
  waitlist: number
  /** Distinct members who logged a verified check-in. */
  checkedIn: number
  /** events.capacity; null = unlimited. */
  capacity: number | null
  /** Whether this event charges (a price or any ticket rows) — free events hide the
   *  Sold / Revenue tiles so the row isn't a wall of zeros. */
  paid: boolean
}

/** Format minor units as money in the event's currency, tolerant of a bad ISO code. */
export function formatEventMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100)
  } catch {
    return `$${(cents / 100).toFixed(2)}`
  }
}

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
