import { describe, expect, it } from 'vitest'
import { templeWeek, weekdayOfTitle } from './temple-week'

// Wall clocks as UTC parts. Mon 2026-10-26 is the first day of the window used below.
const now = new Date('2026-10-26T09:00:00Z')
const ev = (title: string, day: string, from: string, to: string, recurring = true) => ({ title, startsAt: `${day}T${from}:00Z`, endsAt: `${day}T${to}:00Z`, recurring })

describe('the Temple standing week', () => {
  const events = [
    ev('Craft Night', '2026-10-27', '18:00', '21:00'),
    ev('Circles Night', '2026-11-03', '18:00', '21:00'),
    ev('Craft Night', '2026-11-10', '18:00', '21:00'),
    ev('Meld', '2026-10-28', '19:00', '21:00'),
    ev('Moon Circle', '2026-11-04', '19:00', '21:00'),
    ev('Ecstatic Dance', '2026-11-01', '10:00', '12:00'),
    ev('Community Dinner', '2026-11-01', '17:00', '19:00'),
    ev('Harvest Feast', '2026-10-29', '17:00', '20:00', false),
  ]
  const week = templeWeek(events, now)

  it('reads Monday first and Sunday last', () => {
    expect(week.map((d) => d.name)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  })
  it('puts series that never share a date on one weekday as "or", with their hours', () => {
    const tue = week[1]
    expect(tue.slots).toEqual([{ title: 'Craft Night', time: '6–9 PM' }, { title: 'Circles Night', time: '6–9 PM' }])
    expect(tue.joiner).toBe('or')
    expect(tue.note).toBe('Alternating')
  })
  it('chains series that land on the same date as "then"', () => {
    const sun = week[6]
    expect(sun.slots.map((s) => s.title)).toEqual(['Ecstatic Dance', 'Community Dinner'])
    expect(sun.joiner).toBe('then')
    expect(sun.note).toBe('Most Sundays')
  })
  it('never draws a one-off event, and leaves a day with no series quiet', () => {
    expect(week[3].slots).toEqual([])
    expect(week[3].tone).toBe('quiet')
    expect(JSON.stringify(week)).not.toContain('Harvest Feast')
  })
  it('takes a quiet day\'s words from the owner and holds the ones worded as a closure', () => {
    const words = new Map([[1, 'Quiet hours'], [5, 'Retreat and rental']])
    const w = templeWeek(events, now, words)
    expect(w[0]).toMatchObject({ note: 'Quiet hours', tone: 'quiet' })
    expect(w[4]).toMatchObject({ note: 'Retreat and rental', tone: 'held' })
  })
  it('reads only the next four weeks', () => {
    expect(templeWeek([ev('Far', '2026-12-29', '18:00', '19:00')], now).every((d) => d.slots.length === 0)).toBe(true)
  })
  it('names a weekday from a card title', () => {
    expect(weekdayOfTitle('Friday')).toBe(5)
    expect(weekdayOfTitle(' sun ')).toBe(0)
    expect(weekdayOfTitle('Step one')).toBeNull()
  })
})
