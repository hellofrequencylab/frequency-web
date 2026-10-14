import { describe, it, expect } from 'vitest'
import {
  groupEventsByRegion,
  renderThisWeek,
  thisWeekDedupeKey,
  thisWeekQueryBand,
  type ThisWeekEvent,
  type ThisWeekEventRow,
  type ThisWeekRegion,
} from './this-week'

// LIVE-806: the pure half of the Thursday "This week in <region>" email, exercised through the
// seams the cron uses (groupEventsByRegion, renderThisWeek, thisWeekQueryBand, thisWeekDedupeKey).
// No Supabase anywhere in this file's import graph; the rows below are built the way the reads
// module hands them over.

/** Thursday 2026-10-15 15:00 UTC, the first run after this shipped. */
const NOW = new Date('2026-10-15T15:00:00Z')
const BASE = 'https://f.test'
/** The widest real UTC offset any IANA zone reaches: what the SQL band must widen by. */
const FOURTEEN_HOURS_MS = 14 * 60 * 60 * 1000
/** The per-region cap the email lists. */
const MAX_PER_REGION = 8

const NORTH_COUNTY: ThisWeekRegion = { id: 'r-nc', name: 'North County', slug: 'north-county' }
const CARLSBAD: ThisWeekRegion = { id: 'r-cb', name: 'Carlsbad', slug: 'carlsbad' }
const ESCONDIDO: ThisWeekRegion = { id: 'r-es', name: 'Escondido', slug: 'escondido' }
const REGIONS = [NORTH_COUNTY, CARLSBAD, ESCONDIDO]

/** An events row: wall-clock as UTC parts (lib/time/zone.ts), Pacific unless said otherwise. */
function row(over: Partial<ThisWeekEventRow> & { id: string }): ThisWeekEventRow {
  return {
    slug: `slug-${over.id}`,
    title: `Event ${over.id}`,
    starts_at: '2026-10-17T10:00:00',
    time_zone: 'America/Los_Angeles',
    location: null,
    venue_name: null,
    city: null,
    hide_address: false,
    scope_region_id: NORTH_COUNTY.id,
    ...over,
  }
}

/** The ids the North County bundle lists, in order; [] when the region is absent. */
function northCountyIds(rows: ThisWeekEventRow[], now = NOW): string[] {
  const bundles = groupEventsByRegion(REGIONS, rows, { now, baseUrl: BASE })
  return bundles.find((b) => b.region.id === NORTH_COUNTY.id)?.events.map((e) => e.id) ?? []
}

describe('the window (through groupEventsByRegion)', () => {
  it('the database band is now..+7 days, widened by the widest real zone offset on each side', () => {
    const { fromIso, toIso } = thisWeekQueryBand(NOW)
    expect(Date.parse('2026-10-15T15:00:00Z') - Date.parse(fromIso)).toBe(FOURTEEN_HOURS_MS)
    expect(Date.parse(toIso) - Date.parse('2026-10-22T15:00:00Z')).toBe(FOURTEEN_HOURS_MS)
  })

  it('keeps an Event whose stored wall-clock reads earlier than now in UTC but starts later in its own zone', () => {
    // 9:00 Pacific on the Thursday is 16:00Z, after the 15:00Z run; the naive string compare the
    // digest makes would have dropped it (09:00 < 15:00 on the raw column).
    expect(northCountyIds([row({ id: 'am', starts_at: '2026-10-15T09:00:00' })])).toEqual(['am'])
  })

  it('drops what has started, what is past seven days, and rows with no start or no region', () => {
    const rows = [
      row({ id: 'gone', starts_at: '2026-10-15T07:00:00' }), // 07:00 PDT = 14:00Z, an hour ago
      row({ id: 'edge', starts_at: '2026-10-22T08:00:00' }), // 08:00 PDT on day 7 = 15:00Z, the last instant in
      row({ id: 'late', starts_at: '2026-10-22T08:01:00' }), // one minute past the window
      row({ id: 'nostart', starts_at: null }),
      row({ id: 'noregion', scope_region_id: null }),
      row({ id: 'ok', starts_at: '2026-10-18T18:00:00' }),
    ]
    expect(northCountyIds(rows)).toEqual(['ok', 'edge'])
  })

  it('orders by the true instant across zones, earliest first', () => {
    const rows = [
      row({ id: 'ny', starts_at: '2026-10-16T12:00:00', time_zone: 'America/New_York' }), // 16:00Z
      row({ id: 'la', starts_at: '2026-10-16T08:00:00', time_zone: 'America/Los_Angeles' }), // 15:00Z
    ]
    expect(northCountyIds(rows)).toEqual(['la', 'ny'])
  })
})

describe('the claim key', () => {
  it('labels the Thursday run with the same ISO week the Sunday digest will use, under its own prefix', () => {
    expect(thisWeekDedupeKey('p1', NOW)).toBe('this-week:p1:2026-W42')
  })

  it('crosses the year boundary the ISO way', () => {
    // 2027-01-01 is a Friday: it belongs to ISO week 53 of 2026.
    expect(thisWeekDedupeKey('p1', new Date('2027-01-01T15:00:00Z'))).toBe('this-week:p1:2026-W53')
  })
})

describe('grouping by region', () => {
  it('matches on scope_region_id, and a region with no Event is simply absent (it sends nothing)', () => {
    const rows = [
      row({ id: 'a', scope_region_id: NORTH_COUNTY.id }),
      row({ id: 'b', scope_region_id: CARLSBAD.id, starts_at: '2026-10-16T19:00:00' }),
      row({ id: 'c', scope_region_id: NORTH_COUNTY.id, starts_at: '2026-10-16T09:00:00' }),
    ]
    const bundles = groupEventsByRegion(REGIONS, rows, { now: NOW, baseUrl: BASE })
    expect(bundles.map((b) => b.region.id)).toEqual([NORTH_COUNTY.id, CARLSBAD.id])
    expect(bundles.find((b) => b.region.id === ESCONDIDO.id)).toBeUndefined()
    expect(bundles[0].events.map((e) => e.id)).toEqual(['c', 'a'])
    expect(bundles[0].events[0].url).toBe('https://f.test/events/slug-c')
  })

  it('answers no bundles at all when nothing is coming up anywhere', () => {
    expect(groupEventsByRegion(REGIONS, [], { now: NOW, baseUrl: BASE })).toEqual([])
    const stale = [row({ id: 'old', starts_at: '2026-10-01T10:00:00' })]
    expect(groupEventsByRegion(REGIONS, stale, { now: NOW, baseUrl: BASE })).toEqual([])
  })

  it('drops an Event whose region is not in the seeded list, and never matches on city text', () => {
    const rows = [
      row({ id: 'orphan', scope_region_id: 'r-deleted', city: 'Carlsbad' }),
      row({ id: 'texty', scope_region_id: NORTH_COUNTY.id, city: 'Carlsbad Village' }),
    ]
    const bundles = groupEventsByRegion(REGIONS, rows, { now: NOW, baseUrl: BASE })
    expect(bundles.map((b) => b.region.id)).toEqual([NORTH_COUNTY.id])
    expect(bundles[0].events.map((e) => e.id)).toEqual(['texty'])
  })

  it('caps a region at eight Events by default, keeping the earliest, and honours a smaller cap', () => {
    const rows = Array.from({ length: MAX_PER_REGION + 3 }, (_, i) =>
      row({ id: `e${String(i).padStart(2, '0')}`, starts_at: `2026-10-16T${String(8 + i).padStart(2, '0')}:00:00` }),
    )
    const [bundle] = groupEventsByRegion(REGIONS, rows, { now: NOW, baseUrl: BASE })
    expect(bundle.events).toHaveLength(MAX_PER_REGION)
    expect(bundle.events[0].id).toBe('e00')
    expect(bundle.events.at(-1)?.id).toBe('e07')
    const [small] = groupEventsByRegion(REGIONS, rows, { now: NOW, baseUrl: BASE, maxPerRegion: 2 })
    expect(small.events.map((e) => e.id)).toEqual(['e00', 'e01'])
  })

  it('builds the where line from venue, else location, else city, else nothing', () => {
    const rows = [
      row({ id: 'v', venue_name: 'Pine Hall', location: 'x', city: 'y' }),
      row({ id: 'l', venue_name: '  ', location: 'Moonlight Beach', city: 'y', starts_at: '2026-10-17T11:00:00' }),
      row({ id: 'c', venue_name: null, location: null, city: 'Oceanside', starts_at: '2026-10-17T12:00:00' }),
      row({ id: 'n', venue_name: null, location: null, city: null, starts_at: '2026-10-17T13:00:00' }),
    ]
    const [bundle] = groupEventsByRegion(REGIONS, rows, { now: NOW, baseUrl: BASE })
    expect(bundle.events.map((e) => e.where)).toEqual(['Pine Hall', 'Moonlight Beach', 'Oceanside', null])
  })

  it('mails only the city when the host hid the address (SCAN-853)', () => {
    const rows = [
      row({ id: 'h', venue_name: 'Pine Hall', location: '12 Elm St', city: 'Oceanside', hide_address: true }),
      row({ id: 'x', venue_name: 'Pine Hall', location: '12 Elm St', city: null, hide_address: true, starts_at: '2026-10-17T11:00:00' }),
    ]
    const [bundle] = groupEventsByRegion(REGIONS, rows, { now: NOW, baseUrl: BASE })
    expect(bundle.events.map((e) => e.where)).toEqual(['Oceanside', null])
  })
})

describe('the rendering', () => {
  const events: ThisWeekEvent[] = [
    {
      id: 'a',
      title: 'Sunrise circle <open to all>',
      startsAt: '2026-10-17T07:00:00',
      timeZone: 'America/Los_Angeles',
      where: 'Moonlight Beach',
      url: 'https://f.test/events/sunrise',
    },
    {
      id: 'b',
      title: 'Thursday potluck',
      startsAt: '2026-10-15T18:30:00',
      timeZone: 'America/New_York',
      where: null,
      url: 'https://f.test/events/potluck',
    },
  ]
  const render = (regionName: string, list = events) =>
    renderThisWeek({ regionName, recipientName: 'Ana', events: list, baseUrl: BASE, unsubscribeUrl: 'https://f.test/u' })

  it('subject is exactly "This week in <Region name>"', () => {
    expect(render('North County').subject).toBe('This week in North County')
    expect(render('Carlsbad').subject).toBe('This week in Carlsbad')
  })

  it('html carries each title (escaped), its link, its when-line in the Event zone, and the unsubscribe control', () => {
    const r = render('North County')
    expect(r.bodyHtml).toContain('Sunrise circle &lt;open to all&gt;')
    expect(r.bodyHtml).not.toContain('<open to all>')
    expect(r.bodyHtml).toContain('href="https://f.test/events/sunrise"')
    expect(r.bodyHtml).toContain('href="https://f.test/events/potluck"')
    expect(r.bodyHtml).toContain('Moonlight Beach')
    // The stored wall-clock, read back in the Event's own zone and labelled with it.
    expect(r.bodyHtml).toContain('Sat Oct 17 · 7:00 AM PDT')
    expect(r.bodyHtml).toContain('Thu Oct 15 · 6:30 PM EDT')
    expect(r.bodyHtml).toContain('Hi Ana,')
    expect(r.bodyHtml).toContain('2 gatherings are on the calendar near you this week.')
    expect(r.bodyHtml).toContain('href="https://f.test/u"')
    expect(r.bodyHtml).toContain('North County is your home region')
  })

  it('text twin carries the same titles and links, and the singular lead for one Event', () => {
    const r = render('Encinitas', events.slice(0, 1))
    expect(r.text).toContain('This week in Encinitas')
    expect(r.text).toContain('Sunrise circle <open to all>')
    expect(r.text).toContain('https://f.test/events/sunrise')
    expect(r.text).toContain('Sat Oct 17 · 7:00 AM PDT')
    expect(r.text).toContain('One gathering is on the calendar near you this week.')
    expect(r.text).toContain('Unsubscribe from weekly emails: https://f.test/u')
  })

  it('an unparseable start renders an empty when-line rather than throwing', () => {
    const r = render('Vista', [{ ...events[0], startsAt: 'not a date', timeZone: null }])
    expect(r.bodyHtml).toContain('Sunrise circle')
    expect(r.text).toContain('  · Sunrise circle <open to all>,  · Moonlight Beach')
  })

  it('brand voice: no em dashes anywhere in the copy', () => {
    const r = render('Vista')
    expect(r.subject).not.toMatch(/—/)
    expect(r.bodyHtml).not.toMatch(/—/)
    expect(r.text).not.toMatch(/—/)
  })
})
