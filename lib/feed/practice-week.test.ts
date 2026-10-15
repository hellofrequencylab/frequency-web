import { describe, expect, it } from 'vitest'
import { buildPracticeWeek } from './practice-week'
const session = (ended_at: string, seconds = 600, practice_id = 'p') => ({ ended_at, seconds, practice_id })
const log = (logged_for: string, practice_id = 'untimed') => ({ logged_for, practice_id, completed: true, seconds_done: null, seconds_target: null })
describe('real Monday–Sunday practice activity', () => {
  it('anchors Sunday and Monday in the member timezone, with future days distinct from zero', () => {
    const sunday = buildPracticeWeek([], [], 'America/Los_Angeles', new Date('2026-10-19T06:30:00Z'))
    expect(sunday[0].date).toBe('2026-10-12')
    expect(sunday[6]).toMatchObject({ date: '2026-10-18', today: true, future: false })
    const monday = buildPracticeWeek([], [], 'America/Los_Angeles', new Date('2026-10-19T07:30:00Z'))
    expect(monday[0]).toMatchObject({ date: '2026-10-19', label: 'Mon', today: true })
    expect(monday[1]).toMatchObject({ label: 'Tue', future: true, minutes: 0 })
  })
  it('uses local finish dates without pretending to distribute cross-midnight practice time', () => {
    const days = buildPracticeWeek([session('2026-10-16T06:59:00Z', 3600), session('2026-10-16T07:01:00Z', 120)], [], 'America/Los_Angeles', new Date('2026-10-16T09:00:00Z'))
    expect(days[3].minutes).toBe(60)
    expect(days[4].minutes).toBe(2)
  })
  it('sums actual incremental seconds once, distinguishes untimed completions, and ignores future rows', () => {
    const days = buildPracticeWeek([session('2026-10-15T10:00:00Z', 120), session('2026-10-15T11:00:00Z', 180)], [log('2026-10-15', 'p'), log('2026-10-15'), { ...log('2026-10-15', 'partial'), completed: false }, { ...log('2026-10-15', 'timed'), seconds_target: 900 }, log('2026-10-16')], 'UTC', new Date('2026-10-15T12:00:00Z'))
    expect(days[3]).toMatchObject({ minutes: 5, untimed: 1 })
    expect(days[4]).toMatchObject({ minutes: 0, untimed: 0, future: true })
  })
  it('keeps both repeated DST clock hours on their actual local Sunday', () => {
    const days = buildPracticeWeek([session('2026-11-01T08:30:00Z'), session('2026-11-01T09:30:00Z')], [], 'America/Los_Angeles', new Date('2026-11-02T07:30:00Z'))
    expect(days[6]).toMatchObject({ date: '2026-11-01', today: true, minutes: 20 })
    expect(days.map((d) => d.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  })
})
