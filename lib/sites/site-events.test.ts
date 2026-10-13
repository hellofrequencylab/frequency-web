import { describe, expect, it } from 'vitest'
import { dayInZoneOf, expandSiteSeries, foldSiteEvent, siteEventZone, wallClockInZone, zonedDateLabel } from './site-events'
import { dateLabel } from './menswork-page'

const LA = 'America/Los_Angeles'

// The Wildheart seed's Circle Night anchor as the row the readers hand over: a true instant beside its zone.
const anchor = {
  id: 'cn',
  slug: 'wildheart-circle-night-2026-11-03',
  title: 'Circle Night',
  startsAt: '2026-11-04T02:00:00+00:00',
  endsAt: '2026-11-04T03:30:00+00:00',
  timeZone: LA,
  recurrenceType: 'weekly',
  recurrenceRule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU',
  recurrenceUntil: null,
  parentEventId: null,
  isCancelled: false,
}
const child = (day: string, extra: Partial<typeof anchor> = {}) => ({ ...anchor, id: `cn-${day}`, slug: `${anchor.slug}-${day}`, startsAt: `${day}T18:00:00-08:00`, endsAt: `${day}T19:30:00-08:00`, recurrenceType: 'none', recurrenceRule: null, parentEventId: 'cn', ...extra })

describe('a site event in its own zone', () => {
  it('pins the live bug: 2026-11-04T02:00Z is Tue Nov 3 · 6:00 PM in Los Angeles', () => {
    expect(zonedDateLabel('2026-11-04T02:00:00Z', LA)).toEqual({ day: 'Tue Nov 3', time: '6:00 PM' })
    // The fold feeds the one formatter every site surface uses, so it prints the same.
    const wall = wallClockInZone('2026-11-04T02:00:00Z', LA)
    expect(wall).toBe('2026-11-03T18:00:00')
    expect(dateLabel(wall)).toEqual({ day: 'Tue Nov 3', time: '6:00 PM' })
    expect(dayInZoneOf('2026-11-04T02:00:00Z', LA)).toBe('2026-11-03')
  })

  it('reads a Foundation week at 6 PM on Jan 5, not Jan 6', () => {
    expect(zonedDateLabel('2027-01-06T02:00:00Z', LA).day).toBe('Tue Jan 5')
    expect(foldSiteEvent({ id: 'w1', title: 'Week 1', startsAt: '2027-01-06T02:00:00Z', endsAt: '2027-01-06T03:30:00Z', timeZone: LA }).startsAt).toBe('2027-01-05T18:00:00')
  })

  it('treats midnight as all day and falls back from the event zone to the Space zone to home', () => {
    expect(zonedDateLabel('2026-12-08T08:00:00Z', LA)).toEqual({ day: 'Tue Dec 8', time: null })
    expect(siteEventZone('Europe/Lisbon', LA)).toBe('Europe/Lisbon')
    expect(siteEventZone(null, 'Pacific/Auckland')).toBe('Pacific/Auckland')
    expect(siteEventZone('Not/AZone', 'Also/Wrong')).toBe(LA)
    expect(foldSiteEvent({ id: 'x', title: 'x', startsAt: '2026-11-04T02:00:00Z', timeZone: null as string | null }, 'Europe/Lisbon').startsAt).toBe('2026-11-04T02:00:00')
  })

  it('keeps an unreadable value as it is', () => {
    expect(wallClockInZone('soon', LA)).toBe('soon')
    expect(zonedDateLabel('soon', LA)).toEqual({ day: 'soon', time: null })
  })
})

describe('a recurring anchor expanded across the year', () => {
  const through = new Date('2028-01-01T00:00:00Z')

  it('mints every other Tuesday at 6:00 PM Los Angeles through the window, across the DST change', () => {
    const rows = expandSiteSeries([anchor], { through })
    const minted = rows.filter((r) => r.parentEventId === 'cn')
    // Nov 17 2026 to Dec 28 2027: thirty fortnightly landings after the anchor.
    expect(minted.length).toBe(30)
    for (const r of minted) {
      const label = zonedDateLabel(r.startsAt, LA)
      expect(label.day.startsWith('Tue ')).toBe(true)
      expect(label.time).toBe('6:00 PM')
      expect(r.slug).toBe(anchor.slug)
      expect(r.recurrenceType).toBe('none')
      expect(zonedDateLabel(r.endsAt!, LA).time).toBe('7:30 PM')
    }
    expect(minted[0].startsAt).toBe('2026-11-18T02:00:00.000Z')
    // March 23 2027 is after the spring change: 6 PM PDT is 01:00Z the next day.
    expect(minted.map((r) => r.startsAt)).toContain('2027-03-24T01:00:00.000Z')
    expect(rows[0].id).toBe('cn')
    expect(rows.map((r) => r.startsAt)).toEqual([...rows.map((r) => r.startsAt)].sort())
  })

  it('does not mint a day a materialised child holds, leaves a cancelled child\'s day empty, and drops cancelled rows', () => {
    const rows = expandSiteSeries([anchor, child('2026-11-17'), child('2026-12-01', { isCancelled: true })], { through })
    const days = rows.map((r) => dayInZoneOf(r.startsAt, LA))
    expect(days.filter((d) => d === '2026-11-17')).toEqual(['2026-11-17'])
    expect(rows.find((r) => dayInZoneOf(r.startsAt, LA) === '2026-11-17')?.id).toBe('cn-2026-11-17')
    expect(days).not.toContain('2026-12-01')
    expect(rows.some((r) => r.isCancelled)).toBe(false)
    expect(days).toContain('2026-12-15')
  })

  it('honours the series end, the floor and the bound, and leaves a one-time row alone', () => {
    const ended = expandSiteSeries([{ ...anchor, recurrenceUntil: '2026-12-31T00:00:00Z' }], { through })
    expect(ended.map((r) => dayInZoneOf(r.startsAt, LA))).toEqual(['2026-11-03', '2026-11-17', '2026-12-01', '2026-12-15', '2026-12-29'])
    const floored = expandSiteSeries([anchor], { through, from: new Date('2027-06-01T00:00:00Z') })
    expect(floored.filter((r) => r.id !== 'cn').every((r) => r.startsAt >= '2027-06-01')).toBe(true)
    expect(expandSiteSeries([anchor], { through, max: 3 }).length).toBe(4)
    expect(expandSiteSeries([{ id: 'one', title: 'Samhain', startsAt: '2026-11-01T03:00:00Z', timeZone: LA }], { through }).length).toBe(1)
    expect(expandSiteSeries([{ ...anchor, recurrenceRule: 'FREQ=NEVER;BYWHAT=1', recurrenceType: 'none' }], { through }).length).toBe(1)
  })

  it('falls back to the coarse cadence when a row carries no rule', () => {
    const weekly = expandSiteSeries([{ ...anchor, recurrenceRule: null }], { through: new Date('2026-12-02T03:00:00Z') })
    expect(weekly.map((r) => dayInZoneOf(r.startsAt, LA))).toEqual(['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24', '2026-12-01'])
  })
})
