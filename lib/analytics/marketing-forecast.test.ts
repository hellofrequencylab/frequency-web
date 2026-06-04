import { describe, it, expect } from 'vitest'
import { projectGrowth, demandGaps, staleLeaders, buildStrategy } from './marketing-forecast'
import type {
  MarketingIntel,
  GrowthWeek,
  InterestDemand,
  LeaderRow,
} from './marketing-intel'

const week = (w: string, m: number, c: number, e: number): GrowthWeek => ({
  week: w,
  new_members: m,
  new_circles: c,
  new_events: e,
})

describe('projectGrowth', () => {
  it('returns a flat, ungrounded forecast with fewer than 2 points', () => {
    const f = projectGrowth([week('2026-05-01', 5, 1, 0)], 4)
    expect(f.grounded).toBe(false)
    expect(f.new_members.projectedTotal).toBe(0)
    expect(f.new_members.nextWeek).toBe(0)
    expect(f.new_members.momentum).toBe('steady')

    const empty = projectGrowth([], 4)
    expect(empty.grounded).toBe(false)
    expect(empty.new_circles.projectedTotal).toBe(0)
  })

  it('labels a clearly accelerating series and projects upward', () => {
    const series = [
      week('w1', 2, 0, 0),
      week('w2', 4, 0, 0),
      week('w3', 8, 0, 0),
      week('w4', 16, 0, 0),
    ]
    const f = projectGrowth(series, 4)
    expect(f.grounded).toBe(true)
    expect(f.new_members.momentum).toBe('accelerating')
    // Next week should extend above the last observed value.
    expect(f.new_members.nextWeek).toBeGreaterThan(16)
    expect(f.new_members.projectedTotal).toBeGreaterThan(0)
  })

  it('labels a slowing series and never projects below zero', () => {
    const series = [
      week('w1', 20, 0, 0),
      week('w2', 14, 0, 0),
      week('w3', 6, 0, 0),
      week('w4', 1, 0, 0),
    ]
    const f = projectGrowth(series, 4)
    expect(f.new_members.momentum).toBe('slowing')
    expect(f.new_members.projectedTotal).toBeGreaterThanOrEqual(0)
    expect(f.new_members.nextWeek).toBeGreaterThanOrEqual(0)
  })
})

describe('demandGaps', () => {
  const d = (
    interest: string,
    tune_ins: number,
    circles: number,
    members: number,
  ): InterestDemand => ({
    domain: 'connect',
    interest,
    interest_slug: interest.toLowerCase(),
    tune_ins,
    circles,
    members,
  })

  it('ranks a zero-circle interest with demand as the highest-priority gap', () => {
    const gaps = demandGaps([
      d('Climbing', 30, 0, 12), // no circle, real demand -> top priority
      d('Chess', 50, 5, 40), // plenty of supply
      d('Pottery', 0, 0, 0), // no demand -> filtered out
    ])
    expect(gaps[0].interest).toBe('Climbing')
    expect(gaps[0].circles).toBe(0)
    expect(gaps[0].gapScore).toBeGreaterThan(1000)
    expect(gaps[0].reason).toContain('no circle yet')
    // The zero-demand interest is dropped entirely.
    expect(gaps.find((g) => g.interest === 'Pottery')).toBeUndefined()
  })
})

describe('staleLeaders', () => {
  const lead = (id: string, name: string, post: string | null): LeaderRow => ({
    profile_id: id,
    leader: name,
    role: 'host',
    circles: 1,
    members: 5,
    last_post: post,
    last_event: null,
    season_zaps: 0,
    lifetime_gems: 0,
  })

  it('surfaces never-active and oldest leaders first', () => {
    const leaders = [
      lead('a', 'Ana', '2026-05-30'),
      lead('b', 'Ben', null), // never posted -> oldest
      lead('c', 'Cy', '2026-01-01'),
    ]
    const stale = staleLeaders(leaders)
    expect(stale[0].leader).toBe('Ben')
    expect(stale[1].leader).toBe('Cy')
  })
})

describe('buildStrategy', () => {
  it('produces prioritized items from grounded findings', () => {
    const intel: MarketingIntel = {
      windowDays: 90,
      contentDays: 30,
      growth: [
        week('w1', 20, 2, 1),
        week('w2', 14, 2, 1),
        week('w3', 6, 2, 1),
        week('w4', 1, 2, 1),
      ],
      demand: [
        {
          domain: 'connect',
          interest: 'Climbing',
          interest_slug: 'climbing',
          tune_ins: 30,
          circles: 0,
          members: 12,
        },
      ],
      geo: [{ city: 'Austin', circles: 4, members: 80 }],
      content: [],
      leaders: [
        {
          profile_id: 'a',
          leader: 'Ana',
          role: 'host',
          circles: 1,
          members: 5,
          last_post: null,
          last_event: null,
          season_zaps: 0,
          lifetime_gems: 0,
        },
      ],
    }
    const forecast = projectGrowth(intel.growth, 4)
    const gaps = demandGaps(intel.demand)
    const strategy = buildStrategy(intel, forecast, gaps)

    expect(strategy.length).toBeGreaterThan(0)
    // Top demand gap -> a "now" seed-circle item.
    const seed = strategy.find((s) => s.title.includes('Climbing'))
    expect(seed?.status).toBe('now')
    // Hot city concentration.
    expect(strategy.some((s) => s.title.includes('Austin') && s.status === 'now')).toBe(true)
    // Slowing members -> a "watch" re-engage item.
    expect(strategy.some((s) => s.status === 'watch' && /re-engage/i.test(s.title))).toBe(true)
    // Stale leader nudge.
    expect(strategy.some((s) => /nudge/i.test(s.title))).toBe(true)
    // House style: no em dashes anywhere in returned copy.
    for (const s of strategy) {
      expect(s.title).not.toContain('—')
      expect(s.detail).not.toContain('—')
    }
  })
})
