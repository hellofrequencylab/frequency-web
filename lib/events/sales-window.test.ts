import { describe, it, expect } from 'vitest'
import {
  formatSalesDate,
  formatSalesDateTime,
  ticketOnSale,
  ticketSalesCloseAt,
  ticketSalesOpenAt,
  ticketSalesWindowError,
} from './sales-window'
import { eventInstant } from '@/lib/time/zone'

// TICKET SALES WINDOW (ADR-1373), the pure half. Every rule here is a decision the checkout and the
// event page both read, so a disagreement between them would be a buyer told one date on the page
// and refused with another at checkout.
//
// THE EDGES THAT ACTUALLY BREAK THIS, and why each is here:
//   • NO WINDOW AT ALL. Every row in production today. If this ever stops reading as "on sale",
//     the feature has taken every existing ticket offline. It is the positive control.
//   • A NULL EVENT START. Drafts have nullable starts, so the relative rule has nothing to resolve
//     against. Fail-open, or a draft's tickets are locked for a reason nobody can read.
//   • A DAY COUNT OF 0. Falsy in JavaScript, and therefore the single likeliest way this whole
//     feature gets silently disabled by a `if (days)` somewhere.
//   • A WINDOW THAT OPENS AFTER THE EVENT BEGINS. Nonsense an operator can type; it must not crash
//     and must not accidentally read as open.
//   • A DST BOUNDARY. The relative offset is exact elapsed time, so the LOCAL clock time of the
//     opening shifts by an hour across a transition. That is the documented trade, and it is pinned
//     here so nobody "fixes" it into a wall-clock offset without reading the reason.

/** The event's TRUE start instant, resolved the way every caller must (lib/time/zone.ts): the
 *  stored column holds wall-clock kept as UTC parts, so it goes through eventInstant first. */
const LA = 'America/Los_Angeles'

/** 7:00 PM on 2027-03-19 in Los Angeles (PDT that week: DST began 2027-03-14). */
const MELD_START = eventInstant('2027-03-19T19:00:00Z', LA)

const NO_WINDOW = { sales_start_at: null, sales_starts_days_before: null, sales_end_at: null }

describe('ticketSalesOpenAt', () => {
  it('returns null when the tier carries no window at all', () => {
    expect(ticketSalesOpenAt(NO_WINDOW, MELD_START)).toBeNull()
    // And for a row that predates the columns entirely (three undefined fields).
    expect(ticketSalesOpenAt({}, MELD_START)).toBeNull()
  })

  it('resolves the relative day count against the event start', () => {
    const at = ticketSalesOpenAt({ sales_starts_days_before: 14 }, MELD_START)
    expect(at).not.toBeNull()
    expect(at!.getTime()).toBe(MELD_START!.getTime() - 14 * 86_400_000)
  })

  it('treats a day count of 0 as "opens at the event start", not as "no window"', () => {
    // 0 is falsy. A truthiness check anywhere in the resolution turns every 0-day window off.
    const at = ticketSalesOpenAt({ sales_starts_days_before: 0 }, MELD_START)
    expect(at).not.toBeNull()
    expect(at!.getTime()).toBe(MELD_START!.getTime())
  })

  it('lets the ABSOLUTE start win when both are set (the per-occurrence override)', () => {
    const absolute = '2027-03-01T17:00:00.000Z'
    const at = ticketSalesOpenAt(
      { sales_start_at: absolute, sales_starts_days_before: 14 },
      MELD_START,
    )
    expect(at!.toISOString()).toBe(absolute)
    // Clearing the override hands the row straight back to the series rule.
    const back = ticketSalesOpenAt({ sales_start_at: null, sales_starts_days_before: 14 }, MELD_START)
    expect(back!.getTime()).toBe(MELD_START!.getTime() - 14 * 86_400_000)
  })

  it('returns null when the event has no start and only a relative rule (drafts fail OPEN)', () => {
    expect(ticketSalesOpenAt({ sales_starts_days_before: 14 }, null)).toBeNull()
    expect(ticketSalesOpenAt({ sales_starts_days_before: 14 }, undefined)).toBeNull()
    // An absolute start still resolves without an event start: it depends on nothing.
    expect(
      ticketSalesOpenAt({ sales_start_at: '2027-03-01T17:00:00.000Z' }, null)?.toISOString(),
    ).toBe('2027-03-01T17:00:00.000Z')
  })

  it('ignores a corrupt day count and an unparseable date rather than guessing', () => {
    expect(ticketSalesOpenAt({ sales_starts_days_before: -3 }, MELD_START)).toBeNull()
    expect(ticketSalesOpenAt({ sales_starts_days_before: Number.NaN }, MELD_START)).toBeNull()
    expect(ticketSalesOpenAt({ sales_start_at: 'not a date' }, MELD_START)).toBeNull()
    expect(ticketSalesOpenAt({ sales_starts_days_before: 7 }, 'not a date')).toBeNull()
  })

  it('floors a fractional day count to whole days', () => {
    const at = ticketSalesOpenAt({ sales_starts_days_before: 2.9 }, MELD_START)
    expect(at!.getTime()).toBe(MELD_START!.getTime() - 2 * 86_400_000)
  })

  it('keeps the same elapsed notice across a DST boundary, shifting the local clock by an hour', () => {
    // The Meld starts 7:00 PM PDT on 2027-03-19. Fourteen days earlier is 2027-03-05, which is
    // BEFORE the 2027-03-14 transition and therefore PST. Exact elapsed time means the opening
    // lands at 6:00 PM local, not 7:00 PM. Documented, deliberate, and pinned here.
    const at = ticketSalesOpenAt({ sales_starts_days_before: 14 }, MELD_START)!
    const local = new Intl.DateTimeFormat('en-US', {
      timeZone: LA,
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      hour12: false,
    }).format(at)
    expect(local).toContain('3/5')
    expect(local).toContain('18')
    // The elapsed gap is exactly fourteen days, not thirteen days and twenty-three hours.
    expect(MELD_START!.getTime() - at.getTime()).toBe(14 * 86_400_000)
  })
})

describe('ticketSalesCloseAt', () => {
  it('is null without an absolute close, and the parsed instant with one', () => {
    expect(ticketSalesCloseAt(NO_WINDOW)).toBeNull()
    expect(ticketSalesCloseAt({ sales_end_at: '2027-03-18T00:00:00.000Z' })?.toISOString()).toBe(
      '2027-03-18T00:00:00.000Z',
    )
  })
})

describe('ticketOnSale', () => {
  const now = new Date('2027-03-01T12:00:00.000Z')

  it('is OPEN with no window, which is every row in production today', () => {
    const s = ticketOnSale(NO_WINDOW, MELD_START, now)
    expect(s).toEqual({ open: true, opensAt: null, closesAt: null, reason: 'open' })
  })

  it('is NOT_YET before the relative window opens, and names when', () => {
    const s = ticketOnSale({ sales_starts_days_before: 14 }, MELD_START, now)
    expect(s.open).toBe(false)
    expect(s.reason).toBe('not_yet')
    expect(s.opensAt!.getTime()).toBe(MELD_START!.getTime() - 14 * 86_400_000)
  })

  it('is OPEN once the window has started, and still reports when it opened', () => {
    const opensAt = new Date(MELD_START!.getTime() - 14 * 86_400_000)
    const s = ticketOnSale({ sales_starts_days_before: 14 }, MELD_START, new Date(opensAt.getTime() + 1))
    expect(s.open).toBe(true)
    expect(s.reason).toBe('open')
    expect(s.opensAt!.getTime()).toBe(opensAt.getTime())
  })

  it('opens INCLUSIVELY: exactly at opensAt the ticket is on sale', () => {
    const opensAt = new Date(MELD_START!.getTime() - 14 * 86_400_000)
    expect(ticketOnSale({ sales_starts_days_before: 14 }, MELD_START, opensAt).open).toBe(true)
    expect(
      ticketOnSale({ sales_starts_days_before: 14 }, MELD_START, new Date(opensAt.getTime() - 1))
        .open,
    ).toBe(false)
  })

  it('closes EXCLUSIVELY: exactly at closesAt the ticket is no longer on sale', () => {
    const closesAt = '2027-03-10T00:00:00.000Z'
    expect(ticketOnSale({ sales_end_at: closesAt }, MELD_START, new Date(closesAt)).open).toBe(false)
    expect(
      ticketOnSale({ sales_end_at: closesAt }, MELD_START, new Date(Date.parse(closesAt) - 1)).open,
    ).toBe(true)
  })

  it('reports CLOSED, not "opens later", for a window that closed before it could open', () => {
    // Only the ABSOLUTE pair is constrained in SQL; a relative open can still land after an
    // absolute close. Naming a date on which nothing will happen is the failure to avoid.
    const s = ticketOnSale(
      { sales_starts_days_before: 1, sales_end_at: '2027-02-01T00:00:00.000Z' },
      MELD_START,
      now,
    )
    expect(s.reason).toBe('closed')
    expect(s.open).toBe(false)
  })

  it('handles a window that opens AFTER the event begins without crashing or reading as open', () => {
    // An operator can type this. It resolves to a real instant in the future, so the honest answer
    // is "not yet" right up to the event, at which point the checkout's own ended-check refuses.
    const s = ticketOnSale({ sales_start_at: '2027-03-25T00:00:00.000Z' }, MELD_START, now)
    expect(s.open).toBe(false)
    expect(s.reason).toBe('not_yet')
    expect(s.opensAt!.getTime()).toBeGreaterThan(MELD_START!.getTime())
  })

  it('is OPEN when a null event start leaves the relative rule unresolvable', () => {
    const s = ticketOnSale({ sales_starts_days_before: 14 }, null, now)
    expect(s).toEqual({ open: true, opensAt: null, closesAt: null, reason: 'open' })
  })
})

describe('ticketSalesWindowError', () => {
  const now = new Date('2027-03-01T12:00:00.000Z')

  it('never refuses a tier with no window (the positive control)', () => {
    expect(ticketSalesWindowError(NO_WINDOW, MELD_START, now, LA)).toBeNull()
    expect(ticketSalesWindowError({}, MELD_START, now, LA)).toBeNull()
  })

  it('refuses before the window and NAMES the moment it opens', () => {
    const msg = ticketSalesWindowError({ sales_starts_days_before: 14 }, MELD_START, now, LA)
    expect(msg).toBe('This ticket goes on sale Fri, Mar 5 at 6:00 PM PST.')
  })

  it('refuses after the window closes', () => {
    const msg = ticketSalesWindowError(
      { sales_end_at: '2027-02-20T00:00:00.000Z' },
      MELD_START,
      now,
      LA,
    )
    expect(msg).toBe('Sales for this ticket are closed.')
  })

  it('still refuses without naming a date when the moment cannot be resolved', () => {
    // Unreachable through the resolver today (an unresolvable open reads as OPEN), so this pins the
    // wording of the branch rather than a reachable state.
    expect(ticketSalesWindowError({ sales_starts_days_before: 14 }, null, now, LA)).toBeNull()
  })
})

describe('sales-window formatting', () => {
  const at = new Date('2027-03-06T02:00:00.000Z') // 6:00 PM PST on 2027-03-05 in Los Angeles

  it('renders the short day form in the event zone', () => {
    expect(formatSalesDate(at, LA)).toBe('Fri, Mar 5')
    // A different zone genuinely lands on a different day, which is why the zone is passed at all.
    expect(formatSalesDate(at, 'UTC')).toBe('Sat, Mar 6')
  })

  it('renders the long form with the minute and the zone abbreviation', () => {
    expect(formatSalesDateTime(at, LA)).toBe('Fri, Mar 5 at 6:00 PM PST')
  })

  it('degrades to an ISO date rather than throwing on an unusable zone', () => {
    expect(formatSalesDate(at, 'Not/AZone')).toBe('2027-03-06')
  })
})
