import { describe, it, expect } from 'vitest'
import {
  anchorIsDormant,
  computeOccurrenceDates,
  expandOccurrenceInstants,
  occurrenceRow,
} from './event-recurrence'

// F1: monthly recurrence must NOT overflow for day-29/30/31 anchors. The old
// setUTCMonth(+1) turned Jan 31 → Mar 3 (skipping Feb entirely). The fix counts
// whole months from the series start and clamps the day to the target month's
// length, so each occurrence lands on the right calendar month.

const day = (d: Date) => d.toISOString().slice(0, 10)

// The horizon is `now + horizonDays`, so for fixed future-dated anchors we pass a
// horizon comfortably past every asserted occurrence; recurrence_until is the real
// stop bound under test.
const FAR = 5000

describe('computeOccurrenceDates — monthly day-clamping (F1)', () => {
  it('clamps a Jan-31 anchor to Feb 28/29, Mar 31, Apr 30, … (no Feb skip)', () => {
    // 2027 (non-leap) → Feb 28.
    const dates = computeOccurrenceDates(
      { starts_at: '2027-01-31T09:00:00.000Z', recurrence_type: 'monthly', recurrence_until: '2027-06-30T23:59:59.000Z' },
      FAR,
    )
    const days = dates.map(day)
    expect(days).toEqual([
      '2027-02-28', // clamped (Feb has 28 days in 2027), NOT overflowed into March
      '2027-03-31', // back to the original day where the month allows it
      '2027-04-30', // clamped (April has 30)
      '2027-05-31',
      '2027-06-30', // clamped + stops at recurrence_until
    ])
  })

  it('does not accumulate drift: a short month never shortens a later one', () => {
    const dates = computeOccurrenceDates(
      { starts_at: '2027-01-31T00:00:00.000Z', recurrence_type: 'monthly', recurrence_until: '2027-04-30T23:59:59.000Z' },
      FAR,
    )
    const days = dates.map(day)
    // March must be the 31st (original day), proving Feb's clamp didn't carry forward.
    expect(days).toContain('2027-03-31')
  })

  it('handles a Feb-29 leap anchor — only Februaries with a 29th keep the 29', () => {
    // 2028 is a leap year. Anchor on Feb 29, 2028.
    const dates = computeOccurrenceDates(
      { starts_at: '2028-02-29T12:00:00.000Z', recurrence_type: 'monthly', recurrence_until: '2029-02-28T23:59:59.000Z' },
      FAR,
    )
    const days = dates.map(day)
    // Mar 29, Apr 29 … (clamped to 28/30 where needed), and the next Feb (2029, non-leap)
    // clamps to the 28th — never overflows into March.
    expect(days[0]).toBe('2028-03-29')
    expect(days).toContain('2028-04-29')
    expect(days).toContain('2029-02-28') // 2029 Feb has no 29th → clamped, not skipped
    expect(days.some((d) => d.startsWith('2029-03'))).toBe(false) // never overflowed past the Feb cap
  })

  it('preserves the anchor time-of-day on each monthly occurrence', () => {
    const dates = computeOccurrenceDates(
      { starts_at: '2027-01-15T17:30:00.000Z', recurrence_type: 'monthly', recurrence_until: '2027-03-31T23:59:59.000Z' },
      FAR,
    )
    expect(dates[0].toISOString()).toBe('2027-02-15T17:30:00.000Z')
  })
})

describe('computeOccurrenceDates — daily/weekly unchanged (regression)', () => {
  it('daily advances one calendar day at a time', () => {
    const dates = computeOccurrenceDates(
      { starts_at: '2027-01-01T08:00:00.000Z', recurrence_type: 'daily', recurrence_until: '2027-01-04T23:59:59.000Z' },
      FAR,
    )
    expect(dates.map(day)).toEqual(['2027-01-02', '2027-01-03', '2027-01-04'])
  })

  it('weekly advances seven days at a time', () => {
    const dates = computeOccurrenceDates(
      { starts_at: '2027-01-01T08:00:00.000Z', recurrence_type: 'weekly', recurrence_until: '2027-01-29T23:59:59.000Z' },
      FAR,
    )
    expect(dates.map(day)).toEqual(['2027-01-08', '2027-01-15', '2027-01-22', '2027-01-29'])
  })

  it('returns nothing for a non-recurring anchor', () => {
    expect(
      computeOccurrenceDates({ starts_at: '2027-01-01T08:00:00.000Z', recurrence_type: 'none', recurrence_until: null }),
    ).toEqual([])
  })
})

describe('expandOccurrenceInstants — Date.now()-independent expansion to an explicit bound', () => {
  it('expands from step 1 up to and INCLUDING the untilInstant', () => {
    const dates = expandOccurrenceInstants(
      { starts_at: '2027-01-01T08:00:00.000Z', recurrence_type: 'daily', recurrence_until: null },
      new Date('2027-01-04T08:00:00.000Z'),
    )
    expect(dates.map(day)).toEqual(['2027-01-02', '2027-01-03', '2027-01-04'])
  })

  it('stops at recurrence_until even when the bound is later', () => {
    const dates = expandOccurrenceInstants(
      { starts_at: '2027-01-01T08:00:00.000Z', recurrence_type: 'weekly', recurrence_until: '2027-01-15T23:59:59.000Z' },
      new Date('2027-03-01T00:00:00.000Z'),
    )
    expect(dates.map(day)).toEqual(['2027-01-08', '2027-01-15'])
  })

  it('returns [] for a non-recurring anchor', () => {
    expect(
      expandOccurrenceInstants(
        { starts_at: '2027-01-01T08:00:00.000Z', recurrence_type: 'none', recurrence_until: null },
        new Date('2030-01-01T00:00:00.000Z'),
      ),
    ).toEqual([])
  })
})

// ── occurrenceRow — what a materialised occurrence INHERITS from its anchor ──────────────────
//
// The defect this locks down (ADR-883 shape): the child payload copied ten columns and let the
// rest fall to the COLUMN DEFAULTS, which are not neutral. In production both live recurring
// series were $22 events, and all 17 materialised occurrences came out FREE (price_cents NULL),
// `circle_only` on a region-scoped row (so the RLS circle disjunct matched nothing and every
// member but the host lost the event), tenanted to the ROOT space instead of the hosting
// Business Space, with no venue, no map point, no cover image and no capacity cap.

const ANCHOR = {
  id: 'anchor-1',
  slug: 'weekly-cowork',
  title: 'Weekly cowork',
  description: 'Bring a laptop.',
  host_id: 'host-1',
  scope_id: 'region-1',
  scope_type: 'public',
  location: '12 Main St',
  starts_at: '2027-01-01T19:00:00.000Z',
  ends_at: '2027-01-01T21:00:00.000Z',
  recurrence_type: 'weekly' as const,
  recurrence_until: null,
  is_cancelled: false,
  removed_at: null,
  // The columns whose defaults contradict the anchor.
  visibility: 'public',
  status: 'published',
  price_cents: 2200,
  currency: 'usd',
  capacity: 22,
  time_zone: 'America/Denver',
  space_id: 'space-royal-temple',
  host_space_id: 'space-royal-temple',
  category: 'social',
  cover_image_path: 'covers/a.jpg',
  venue_name: 'Royal Temple',
  city: 'Ojai',
  hide_address: true,
  join_mode: 'tickets',
  is_demo: false,
  geog: '0101000020E610000071602816AE525DC085D9BA8A7B844040',
  details: { specialInstructions: 'Door code 1234' },
}

describe('occurrenceRow — an occurrence inherits the anchor, not the column defaults', () => {
  const start = new Date('2027-01-08T19:00:00.000Z')
  const row = occurrenceRow(ANCHOR, start, 2 * 60 * 60 * 1000)

  it('carries the MONEY columns forward (a paid series must not materialise free dates)', () => {
    expect(row.price_cents).toBe(2200)
    expect(row.currency).toBe('usd')
    expect(row.capacity).toBe(22)
    expect(row.join_mode).toBe('tickets')
  })

  it('carries VISIBILITY and STATUS forward (the default is circle_only, which hides the row)', () => {
    expect(row.visibility).toBe('public')
    expect(row.status).toBe('published')
  })

  it('carries TENANCY forward (the default trigger rewrites a NULL space_id to ROOT)', () => {
    expect(row.space_id).toBe('space-royal-temple')
    expect(row.host_space_id).toBe('space-royal-temple')
  })

  it('carries the venue, the map point, the zone and the presentation forward', () => {
    expect(row.venue_name).toBe('Royal Temple')
    expect(row.city).toBe('Ojai')
    expect(row.geog).toBe(ANCHOR.geog)
    expect(row.time_zone).toBe('America/Denver')
    expect(row.cover_image_path).toBe('covers/a.jpg')
    expect(row.hide_address).toBe(true)
    expect(row.details).toEqual({ specialInstructions: 'Door code 1234' })
  })

  it('sets the occurrence identity: its own date, per-day slug, parent link, and no cadence', () => {
    expect(row.starts_at).toBe('2027-01-08T19:00:00.000Z')
    expect(row.ends_at).toBe('2027-01-08T21:00:00.000Z')
    expect(row.slug).toBe('weekly-cowork-2027-01-08')
    expect(row.parent_event_id).toBe('anchor-1')
    // A DB CHECK forbids a materialised occurrence from itself recurring.
    expect(row.recurrence_type).toBe('none')
    expect(row.recurrence_until).toBeNull()
  })

  it('never copies the anchor id, its claim link, or its own lifecycle stamps', () => {
    expect(row.id).toBeUndefined()
    expect(row.claim_token).toBeUndefined()
    expect(row.cancelled_at).toBeUndefined()
    expect(row.removed_at).toBeUndefined()
    expect(row.featured_at).toBeUndefined()
  })

  it('leaves ends_at null when the anchor has no duration', () => {
    expect(occurrenceRow(ANCHOR, start, null).ends_at).toBeNull()
  })

  it('drops a GeoJSON-object geog rather than writing a value the insert would reject', () => {
    // PostgREST returns geography as EWKB hex here, but a GeoJSON object serialization would
    // abort the whole batch on insert. Degrade to today's behaviour (no point), never to an error.
    const objectGeog = occurrenceRow(
      { ...ANCHOR, geog: { type: 'Point', coordinates: [-119.2, 34.4] } },
      start,
      null,
    )
    expect('geog' in objectGeog).toBe(false)
  })

  it('passes a NULL inherited column through instead of dropping it to the default', () => {
    const free = occurrenceRow({ ...ANCHOR, price_cents: null, capacity: null }, start, null)
    expect(free.price_cents).toBeNull()
    expect(free.capacity).toBeNull()
  })
})

describe('anchorIsDormant — a cancelled or removed series stops materialising', () => {
  it('is false for a live anchor', () => {
    expect(anchorIsDormant({ is_cancelled: false, removed_at: null })).toBe(false)
  })

  it('is true once the host cancels — the daily cron kept minting fresh occurrences otherwise', () => {
    expect(anchorIsDormant({ is_cancelled: true, removed_at: null })).toBe(true)
  })

  it('is true once staff removes it (moderation sets removed_at)', () => {
    expect(anchorIsDormant({ is_cancelled: false, removed_at: '2026-07-28T00:00:00Z' })).toBe(true)
  })
})
