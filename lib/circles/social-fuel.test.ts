import { describe, it, expect } from 'vitest'
import {
  circleWeekMetQuorum,
  circleStreakWeeks,
  circleMatesToNudge,
  structuralRiskFromCircleTies,
  structuralRiskBoost,
  deterministicCelebration,
  CIRCLE_MIN_SIZE,
} from './social-fuel'

// Resonance Engine Phase 5 (ADR-386): the social-fuel pure helpers. Pin the cooperative
// Circle-streak math, the nudge selection, the zero-ties structural-risk signal, and the
// deterministic in-voice celebration (no "earn N Zaps", no dashes).

describe('circleWeekMetQuorum', () => {
  it('needs at least the minimum Circle size (a solo member is not a Circle streak)', () => {
    expect(circleWeekMetQuorum({ activeMembers: 1, circleSize: 1 })).toBe(false)
    expect(CIRCLE_MIN_SIZE).toBe(2)
  })

  it('meets quorum when at least half the Circle was active together', () => {
    expect(circleWeekMetQuorum({ activeMembers: 2, circleSize: 4 })).toBe(true) // ceil(2)
    expect(circleWeekMetQuorum({ activeMembers: 1, circleSize: 4 })).toBe(false)
    expect(circleWeekMetQuorum({ activeMembers: 2, circleSize: 3 })).toBe(true) // ceil(1.5)=2
  })

  it('floors malformed counts and never throws', () => {
    expect(circleWeekMetQuorum({ activeMembers: -3, circleSize: 4 })).toBe(false)
  })
})

describe('circleStreakWeeks', () => {
  it('counts consecutive quorum weeks from the current week', () => {
    const weeks = [
      { activeMembers: 3, circleSize: 4 },
      { activeMembers: 2, circleSize: 4 },
      { activeMembers: 4, circleSize: 4 },
    ]
    expect(circleStreakWeeks(weeks)).toBe(3)
  })

  it('breaks on the first missed week (no freeze for the local streak)', () => {
    const weeks = [
      { activeMembers: 3, circleSize: 4 },
      { activeMembers: 1, circleSize: 4 }, // missed quorum
      { activeMembers: 4, circleSize: 4 },
    ]
    expect(circleStreakWeeks(weeks)).toBe(1)
  })

  it('is 0 when this week missed quorum', () => {
    expect(circleStreakWeeks([{ activeMembers: 0, circleSize: 4 }])).toBe(0)
    expect(circleStreakWeeks([])).toBe(0)
  })
})

describe('circleMatesToNudge', () => {
  const mates = [
    { profileId: 'me', current: 9, atRisk: true },
    { profileId: 'a', current: 12, atRisk: true },
    { profileId: 'b', current: 3, atRisk: false }, // not at risk
    { profileId: 'c', current: 5, atRisk: true },
    { profileId: 'd', current: 1, atRisk: true }, // too short to be worth saving
  ]

  it('surfaces at-risk mates with a real run, longest first, excluding the nudger', () => {
    const out = circleMatesToNudge(mates, 'me')
    expect(out.map((m) => m.profileId)).toEqual(['a', 'c'])
  })

  it('respects the cap (no spamming the whole Circle)', () => {
    expect(circleMatesToNudge(mates, 'me', 1).map((m) => m.profileId)).toEqual(['a'])
    expect(circleMatesToNudge(mates, 'me', 0)).toEqual([])
  })
})

describe('structuralRiskFromCircleTies', () => {
  it('flags zero ties as the highest structural risk (unanchored)', () => {
    expect(structuralRiskFromCircleTies(0)).toBe('unanchored')
    expect(structuralRiskFromCircleTies(1)).toBe('thin')
    expect(structuralRiskFromCircleTies(2)).toBe('anchored')
    expect(structuralRiskFromCircleTies(7)).toBe('anchored')
  })

  it('floors malformed ties to unanchored', () => {
    expect(structuralRiskFromCircleTies(-4)).toBe('unanchored')
  })

  it('boost is highest for unanchored and zero for anchored', () => {
    expect(structuralRiskBoost('unanchored')).toBeGreaterThan(structuralRiskBoost('thin'))
    expect(structuralRiskBoost('thin')).toBeGreaterThan(structuralRiskBoost('anchored'))
    expect(structuralRiskBoost('anchored')).toBe(0)
  })
})

describe('deterministicCelebration', () => {
  it('names the achievement, keeps the @mention, and never says earn/Zaps or uses a dash', () => {
    const j = deterministicCelebration({ handle: 'maya', kind: 'journey_finished', detail: 'Stillness' })
    expect(j).toContain('@maya')
    expect(j).toContain('Stillness')
    expect(j).not.toMatch(/[–—]/)
    expect(j.toLowerCase()).not.toContain('earn')
    expect(j).not.toMatch(/zaps|gems/i)

    const m = deterministicCelebration({ handle: 'sam', kind: 'master_rank' })
    expect(m).toContain('@sam')
    expect(m).toContain('Master')
    expect(m).not.toMatch(/[–—]/)
  })
})
