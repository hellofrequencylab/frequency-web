// The event core-stats SHAPE and its money formatter — the half with no database in it.
//
// Split out of lib/events/event-stats.ts (LIVE-037). The read there opens the service-role
// admin client; this interface and Intl formatter are all the presentational card row needs.
// They shared a module, so <EventCoreStatsCards> reaching for formatEventMoney pulled the
// RLS-bypassing Supabase client into the browser graph of every surface that renders it.
//
// Both are re-exported from lib/events/event-stats.ts, so every server caller is unchanged.
// CLIENT code must import from HERE.

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
