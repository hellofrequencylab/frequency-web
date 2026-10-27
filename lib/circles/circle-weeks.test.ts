import { describe, expect, it } from 'vitest'
import { bucketCircleWeeks, weeksTogether } from './circle-weeks-pure'

// Wed 2026-10-28. Weeks start Monday: this week is 2026-10-26.
const now = new Date('2026-10-28T12:00:00Z')
const joined = Array.from({ length: 10 }, () => '2026-01-01T00:00:00Z')
const log = (profile: number, iso: string) => ({ profile_id: `p${profile}`, created_at: iso })

describe('bucketCircleWeeks', () => {
  it('starts weeks on Monday, most recent first', () => {
    const w = bucketCircleWeeks([], joined, now, 3)
    expect(w.map((x) => x.start)).toEqual(['2026-10-26', '2026-10-19', '2026-10-12'])
  })
  it('counts distinct members per week and keeps a week at half the circle', () => {
    const logs = [1, 2, 3, 4, 5].map((n) => log(n, '2026-10-20T08:00:00Z')).concat([log(1, '2026-10-21T08:00:00Z')])
    const w = bucketCircleWeeks(logs, joined, now, 3)
    expect(w[1]).toMatchObject({ activeMembers: 5, circleSize: 10, met: true })
    expect(w[0]).toMatchObject({ activeMembers: 0, met: false })
  })
  it('leaves out members who had not joined yet', () => {
    const w = bucketCircleWeeks([], ['2026-10-27T00:00:00Z', '2026-10-28T00:00:00Z'], now, 2)
    expect(w[0].circleSize).toBe(2)
    expect(w[1].circleSize).toBe(0)
  })
})

describe('weeksTogether', () => {
  const cell = (met: boolean) => ({ start: '', activeMembers: met ? 5 : 0, circleSize: 10, met })
  it('counts back from this week when it is kept', () => {
    expect(weeksTogether([cell(true), cell(true), cell(false), cell(true)])).toBe(2)
  })
  it('does not let a week still in progress break the run', () => {
    expect(weeksTogether([cell(false), cell(true), cell(true), cell(false)])).toBe(2)
  })
  it('is zero with no weeks', () => {
    expect(weeksTogether([])).toBe(0)
  })
})
