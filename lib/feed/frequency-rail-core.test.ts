import { describe, expect, it } from 'vitest'
import { buildBoard, buildGoals, buildWeek, wallTime, weekPlanCount } from './frequency-rail-core'

describe('buildWeek', () => {
  it('lays out seven days from today and files each plan on its own day', () => {
    const week = buildWeek('2026-10-12', [
      { eventId: 'b', slug: 'sound-bath', title: 'Sound bath', startsAt: '2026-10-14T19:00:00.000Z' },
      { eventId: 'a', slug: 'beach-yoga', title: 'Beach yoga', startsAt: '2026-10-12T08:30:00.000Z' },
      { eventId: 'x', slug: 'later', title: 'Out of range', startsAt: '2026-10-20T08:00:00.000Z' },
    ])
    expect(week).toHaveLength(7)
    expect(week[0]).toMatchObject({ date: '2026-10-12', dow: 'Mon', d: '12' })
    expect(week[6]).toMatchObject({ date: '2026-10-18', dow: 'Sun', d: '18' })
    expect(week[0].items).toEqual([{ eventId: 'a', href: '/events/beach-yoga', name: 'Beach yoga', time: '8:30am' }])
    expect(week[2].items[0]).toMatchObject({ name: 'Sound bath', time: '7pm' })
    expect(weekPlanCount(week)).toBe(2)
  })

  it('counts a plan once even when two RSVP rows name it', () => {
    const row = { eventId: 'a', slug: 's', title: 'T', startsAt: '2026-10-12T12:00:00.000Z' }
    expect(weekPlanCount(buildWeek('2026-10-12', [row, row]))).toBe(1)
  })

  it('reads midnight and noon right', () => {
    expect(wallTime('2026-10-12T00:00:00.000Z')).toBe('12am')
    expect(wallTime('2026-10-12T12:05:00.000Z')).toBe('12:05pm')
  })
})

describe('buildGoals', () => {
  it('never carries a reward and reads only real state', () => {
    const goals = buildGoals({ adopted: 2, toLog: 1, streak: 12, lesson: null, plans: 0 })
    expect(goals.map((g) => g.key)).toEqual(['practice', 'streak', 'plan'])
    expect(goals[0]).toMatchObject({ progress: '1 of 2', pct: 50, done: false })
    expect(goals[1]).toMatchObject({ title: 'Keep your 12-day streak', done: true })
    expect(goals[2]).toMatchObject({ done: false, progress: null })
    expect(JSON.stringify(goals)).not.toMatch(/⚡|zap/i)
  })

  it('asks for an adoption when nothing is adopted, and a lesson when enrolled', () => {
    const goals = buildGoals({ adopted: 0, toLog: 0, streak: 0, lesson: { step: 'Lesson 6', pct: 42 }, plans: 3 })
    expect(goals[0]).toMatchObject({ title: 'Adopt a practice', done: false })
    expect(goals[1]).toMatchObject({ key: 'lesson', title: 'Lesson 6', pct: 42 })
    expect(goals[2]).toMatchObject({ done: true, progress: '3 this week' })
  })
})

describe('buildBoard', () => {
  const row = (id: string, zaps: number, optedOut = false) => ({ id, name: id.toUpperCase(), avatarUrl: null, zaps, optedOut })

  it('lists the top four and appends the member below them', () => {
    const b = buildBoard([row('a', 90), row('b', 80), row('c', 70), row('d', 60), row('e', 50), row('me', 10), row('z', 0)], 'me')
    expect(b?.top.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd', 'me'])
    expect(b?.top[4]).toMatchObject({ n: 6, me: true })
    expect(b).toMatchObject({ contributors: 6, members: 7 })
  })

  it('keeps an opted-out member off the list but in the total', () => {
    const b = buildBoard([row('a', 90, true), row('me', 10)], 'me')
    expect(b?.top.map((e) => e.id)).toEqual(['me'])
    expect(b?.top[0].n).toBe(1)
    expect(b?.contributors).toBe(2)
  })

  it('draws nothing for a board of one', () => {
    expect(buildBoard([row('me', 10)], 'me')).toBeNull()
  })
})
