// TICKET SALES WINDOW (ADR-1373). WHEN a ticket may be bought, as opposed to WHO may buy it
// (the ADR-823 admission gate) or WHAT THEY PAY (the ADR-1372 member benefits). The three compose
// at one checkout and any one of them can refuse.
//
// WHY THIS EXISTS: "members get first RSVP" is currently achieved by an operator leaving the public
// ticket row inactive and remembering to flip it on later. That is a promise kept by memory, and it
// silently fails on every recurring event. Royal Temple's Meld runs on a fourteen-day recurrence, so
// an absolute date would have to be re-entered for every occurrence, which is the failure mode being
// removed rather than a fix for it. Hence the relative shape (`sales_starts_days_before`), written
// once and resolved against each occurrence's own start.
//
// SECURITY POSTURE: PURE, and therefore NOT A GATE. No Supabase, no Next, no React, no IO, no
// authorization, no clock of its own (`now` is always injected). This module DECIDES; it does not
// ENFORCE. The authoritative refusal lives in `lib/billing/tickets.ts`, which is the only place a
// ticket can actually be bought. Everything a buyer's browser renders from this is a hint, and a
// client that lies about it still meets the same server decision at checkout.
//
// 🔴 FAIL-OPEN, DELIBERATELY. Every row in production today has no window at all, and an
// unresolvable window (a draft event with no start, a malformed day count) resolves to ON SALE
// rather than locked. The opposite default would turn a data gap into a ticket nobody can buy and
// no operator can diagnose, which is precisely the bug ADR-823's root-exclusion had to undo. A
// window that does not apply must be indistinguishable from no window at all.

/** The three columns this module reads, exactly as `event_ticket_types` stores them (ADR-1373).
 *  Every field nullable: three NULLs is "no window", which is every existing row. */
export interface SalesWindowFields {
  /** Absolute open time (ISO). Wins over `sales_starts_days_before` when both are set. */
  sales_start_at?: string | null
  /** Opens this many days before the event starts. 0 is meaningful and is NOT null. */
  sales_starts_days_before?: number | null
  /** Absolute close time (ISO). null = sells until the event ends. */
  sales_end_at?: string | null
}

export type SalesWindowReason = 'open' | 'not_yet' | 'closed'

export interface SalesWindowState {
  /** May this ticket be bought right now? */
  open: boolean
  /** When it opens, or null when nothing delays it. Non-null even once it HAS opened. */
  opensAt: Date | null
  /** When it stops selling, or null when nothing closes it early. */
  closesAt: Date | null
  reason: SalesWindowReason
}

const MS_PER_DAY = 86_400_000

/** Any input to a real Date, or null. Rejects an unparseable string rather than propagating an
 *  Invalid Date, which compares false against everything and would read as "always open". */
function asDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** A usable whole day count, or null. A negative or non-finite count is treated as UNSET rather
 *  than clamped: the database check constraint forbids one, so a row carrying it is corrupt, and
 *  guessing what a corrupt row meant is how a ticket ends up locked for a reason nobody can read. */
function asDayCount(value: number | null | undefined): number | null {
  if (value == null) return null
  if (!Number.isFinite(value) || value < 0) return null
  return Math.floor(value)
}

/**
 * The effective time this ticket goes on sale, or null when nothing delays it.
 *
 * 🔴 PRECEDENCE: the ABSOLUTE `sales_start_at` wins whenever both are set. The relative day count is
 * the SERIES rule, written once and inherited by every occurrence of a recurrence; the absolute
 * value is a per-occurrence override an operator typed for this one date. If the series rule won,
 * the override would be unexpressible, and an operator who wanted to open one night early would have
 * no way to say so. The reverse is not true: clearing the absolute value hands the row straight back
 * to the series rule, so the override is also undoable in one field.
 *
 * `eventStartsAt` is the event's TRUE start instant, resolved by the caller (the stored column is
 * wall-clock kept as UTC parts, so it must go through `eventInstant` first, lib/time/zone.ts). Null
 * is legitimate: drafts have nullable starts. With a null start the relative rule cannot resolve and
 * returns null, which reads as "on sale" — see the fail-open note in the header.
 *
 * DST: the relative offset is exact elapsed time, N x 24h back from the start instant, so every
 * occurrence in a series gets the SAME amount of notice. Across a DST boundary the local clock time
 * of the opening therefore shifts by an hour. That is the accepted trade: a wall-clock offset would
 * instead hand one occurrence an hour more notice than the next, and "everyone gets fourteen days"
 * is the promise being made, not "everyone gets 7pm".
 */
export function ticketSalesOpenAt(
  tier: SalesWindowFields,
  eventStartsAt: Date | string | null | undefined,
): Date | null {
  const absolute = asDate(tier.sales_start_at)
  if (absolute) return absolute

  const days = asDayCount(tier.sales_starts_days_before)
  if (days == null) return null

  const start = asDate(eventStartsAt)
  if (!start) return null

  return new Date(start.getTime() - days * MS_PER_DAY)
}

/** The effective time this ticket stops selling, or null when nothing closes it early. Absolute
 *  only: a relative close would need a second rule ("how long after it opened") that nobody has
 *  asked for, and an unused rule is a rule that rots. */
export function ticketSalesCloseAt(tier: SalesWindowFields): Date | null {
  return asDate(tier.sales_end_at)
}

/**
 * Is this ticket on sale at `now`, and if not, when?
 *
 * CLOSED IS CHECKED FIRST, and it matters in one case: a relative open time can land AFTER an
 * absolute close (the database can only check the absolute pair, since a relative open depends on
 * `events.starts_at`, which a constraint on this table cannot see). Such a window can never open, so
 * reporting "closed" is the honest answer; reporting "opens on <date>" would name a date on which
 * nothing happens.
 *
 * Boundaries are INCLUSIVE at the open and EXCLUSIVE at the close: exactly at `opensAt` the ticket
 * is on sale, exactly at `closesAt` it is not. A buyer who clicks on the stroke of the hour gets the
 * ticket, and a window advertised as closing at 6pm does not sell at 6pm.
 */
export function ticketOnSale(
  tier: SalesWindowFields,
  eventStartsAt: Date | string | null | undefined,
  now: Date = new Date(),
): SalesWindowState {
  const opensAt = ticketSalesOpenAt(tier, eventStartsAt)
  const closesAt = ticketSalesCloseAt(tier)
  const t = now.getTime()

  if (closesAt && t >= closesAt.getTime()) {
    return { open: false, opensAt, closesAt, reason: 'closed' }
  }
  if (opensAt && t < opensAt.getTime()) {
    return { open: false, opensAt, closesAt, reason: 'not_yet' }
  }
  return { open: true, opensAt, closesAt, reason: 'open' }
}

/** "Fri, Mar 6" in `timeZone`. The short form for a ticket row, where the day is the answer and the
 *  minute is noise. Falls back to the ISO date if the zone is unusable, so a bad zone costs
 *  precision rather than the whole line. */
export function formatSalesDate(at: Date, timeZone?: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(at)
  } catch {
    return at.toISOString().slice(0, 10)
  }
}

/** "Fri, Mar 6 at 7:00 PM PST" in `timeZone`. The long form for a refusal, where a buyer who just
 *  got turned away needs the minute, not the day. */
export function formatSalesDateTime(at: Date, timeZone?: string | null): string {
  const day = formatSalesDate(at, timeZone)
  try {
    const time = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(at)
    return `${day} at ${time}`
  } catch {
    return day
  }
}

/**
 * PURE (tested): the member-readable refusal for a ticket outside its window, or null when it is on
 * sale. The mirror of `spaceMembershipGateError` (ADR-823), and composed beside it at the checkout.
 *
 * A refusal NAMES the moment. "Not on sale yet" tells a buyer to come back at random; a date and a
 * time tells them when to set an alarm, which is the entire point of a members-first window.
 */
export function ticketSalesWindowError(
  tier: SalesWindowFields,
  eventStartsAt: Date | string | null | undefined,
  now: Date = new Date(),
  timeZone?: string | null,
): string | null {
  const state = ticketOnSale(tier, eventStartsAt, now)
  if (state.open) return null
  if (state.reason === 'closed') return 'Sales for this ticket are closed.'
  return state.opensAt
    ? `This ticket goes on sale ${formatSalesDateTime(state.opensAt, timeZone)}.`
    : 'This ticket isn’t on sale yet.'
}
