import { describe, it, expect } from 'vitest'
import { recruiterTier, signupsToNextTier, rankRecruiters, type RecruiterRow } from './leaderboard'

describe('recruiter tiers', () => {
  it('maps signups to the highest tier reached', () => {
    expect(recruiterTier(0).key).toBe('scout')
    expect(recruiterTier(2).key).toBe('scout')
    expect(recruiterTier(3).key).toBe('connector')
    expect(recruiterTier(9).key).toBe('connector')
    expect(recruiterTier(10).key).toBe('recruiter')
    expect(recruiterTier(24).key).toBe('recruiter')
    expect(recruiterTier(25).key).toBe('ambassador')
    expect(recruiterTier(50).key).toBe('luminary')
    expect(recruiterTier(999).key).toBe('luminary')
  })

  it('clamps junk input to scout', () => {
    expect(recruiterTier(-5).key).toBe('scout')
    expect(recruiterTier(NaN).key).toBe('scout')
  })

  it('reports remaining signups to the next tier, null at the top', () => {
    expect(signupsToNextTier(0)).toEqual({ next: expect.objectContaining({ key: 'connector' }), remaining: 3 })
    expect(signupsToNextTier(3)).toEqual({ next: expect.objectContaining({ key: 'recruiter' }), remaining: 7 })
    expect(signupsToNextTier(50)).toBeNull()
  })
})

describe('rankRecruiters', () => {
  const row = (id: string, signups: number, scans: number, entryPoints: number): RecruiterRow => ({
    id, displayName: id, handle: id, avatarUrl: null, entryPoints, scans, signups, tier: recruiterTier(signups),
  })

  it('orders by signups, then scans, then entry-point count', () => {
    const ranked = rankRecruiters([
      row('a', 5, 100, 2),
      row('b', 10, 1, 1),
      row('c', 5, 100, 5), // ties a on signups+scans, more points → ahead of a
      row('d', 5, 200, 1), // ties a on signups, more scans → ahead of both
    ])
    expect(ranked.map((r) => r.id)).toEqual(['b', 'd', 'c', 'a'])
  })

  it('does not mutate the input array', () => {
    const input = [row('a', 1, 0, 0), row('b', 2, 0, 0)]
    rankRecruiters(input)
    expect(input.map((r) => r.id)).toEqual(['a', 'b'])
  })
})
