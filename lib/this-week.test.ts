import { describe, expect, it } from 'vitest'
import {
  LAUNCH_REGIONS,
  THIS_WEEK_MAX_EVENTS,
  cityKey,
  pickThisWeek,
  regionForCity,
  thisWeekDedupeKey,
  thisWeekSendsOpen,
} from './this-week'

const NC = LAUNCH_REGIONS[0]
const now = new Date('2026-12-03T16:00:00Z')
const ev = (o: Partial<{ slug: string; city: string | null; starts_at: string; is_cancelled: boolean }>) => ({
  slug: 's',
  title: 'T',
  city: 'Carlsbad',
  starts_at: '2026-12-05T18:00:00Z',
  is_cancelled: false,
  ...o,
})

describe('regionForCity', () => {
  it('matches a North County city however it is written', () => {
    expect(regionForCity('Carlsbad')?.slug).toBe('north-county')
    expect(regionForCity('Encinitas, CA')?.slug).toBe('north-county')
    expect(regionForCity('  san marcos ')?.slug).toBe('north-county')
    expect(cityKey('Oceanside, California, USA')).toBe('oceanside')
  })
  it('leaves other cities and blanks out', () => {
    expect(regionForCity('Pacific Beach')).toBeNull()
    expect(regionForCity(null)).toBeNull()
  })
})

describe('pickThisWeek', () => {
  it('keeps the region, the next seven days and live events, soonest first', () => {
    const picks = pickThisWeek(
      [
        ev({ slug: 'later', starts_at: '2026-12-08T18:00:00Z' }),
        ev({ slug: 'soon', starts_at: '2026-12-04T18:00:00Z' }),
        ev({ slug: 'elsewhere', city: 'La Jolla' }),
        ev({ slug: 'past', starts_at: '2026-12-02T18:00:00Z' }),
        ev({ slug: 'next-week', starts_at: '2026-12-11T18:00:00Z' }),
        ev({ slug: 'off', is_cancelled: true }),
      ],
      NC,
      now,
    )
    expect(picks.map((p) => p.slug)).toEqual(['soon', 'later'])
  })
  it('caps the list', () => {
    const many = Array.from({ length: 20 }, (_, i) => ev({ slug: `e${i}` }))
    expect(pickThisWeek(many, NC, now)).toHaveLength(THIS_WEEK_MAX_EVENTS)
  })
  it('gives an empty region nothing to send', () => {
    expect(pickThisWeek([ev({ city: 'South Bay' })], NC, now)).toEqual([])
  })
})

describe('sending', () => {
  it('is a dry run before 3 December 2026', () => {
    expect(thisWeekSendsOpen(new Date('2026-11-26T16:00:00Z'))).toBe(false)
    expect(thisWeekSendsOpen(new Date('2026-12-03T16:00:00Z'))).toBe(true)
  })
  it('keys one email per member per region per week', () => {
    const a = thisWeekDedupeKey('north-county', 'p1', new Date('2026-12-03T16:00:00Z'))
    expect(a).toBe(thisWeekDedupeKey('north-county', 'p1', new Date('2026-12-04T09:00:00Z')))
    expect(a).not.toBe(thisWeekDedupeKey('north-county', 'p1', new Date('2026-12-10T16:00:00Z')))
  })
})
