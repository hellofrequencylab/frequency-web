import { describe, it, expect } from 'vitest'
import { shouldShow, readProgressMap, triggerQualifies, type WalkthroughProgress, type MemberContext } from './runtime'
import type { Walkthrough, WalkthroughTrigger } from '@/lib/walkthroughs'

// Cadence gate tests. `now` is fixed; timestamps are expressed relative to it so the
// window math (2h / 12h / 24h) is unambiguous.
const NOW = new Date('2026-06-12T12:00:00.000Z').getTime()
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const HOUR = 60 * 60 * 1000

describe('shouldShow — completed wins for every cadence', () => {
  const cadences = ['once', 'per_session', 'daily', 'until_done'] as const
  for (const cadence of cadences) {
    it(`${cadence}: completedAt set → never show`, () => {
      const p: WalkthroughProgress = { completedAt: ago(HOUR), seenAt: ago(10 * HOUR) }
      expect(shouldShow(cadence, p, NOW)).toBe(false)
    })
  }
})

describe('shouldShow — once', () => {
  it('shows when never seen or dismissed', () => {
    expect(shouldShow('once', undefined, NOW)).toBe(true)
    expect(shouldShow('once', {}, NOW)).toBe(true)
  })
  it('hides once seen', () => {
    expect(shouldShow('once', { seenAt: ago(100 * HOUR) }, NOW)).toBe(false)
  })
  it('hides once dismissed', () => {
    expect(shouldShow('once', { dismissedAt: ago(100 * HOUR) }, NOW)).toBe(false)
  })
})

describe('shouldShow — daily', () => {
  it('shows when nothing within 24h', () => {
    expect(shouldShow('daily', undefined, NOW)).toBe(true)
    expect(shouldShow('daily', { seenAt: ago(25 * HOUR) }, NOW)).toBe(true)
    expect(shouldShow('daily', { dismissedAt: ago(25 * HOUR) }, NOW)).toBe(true)
  })
  it('hides when seen within 24h', () => {
    expect(shouldShow('daily', { seenAt: ago(2 * HOUR) }, NOW)).toBe(false)
  })
  it('hides when dismissed within 24h', () => {
    expect(shouldShow('daily', { dismissedAt: ago(2 * HOUR) }, NOW)).toBe(false)
  })
})

describe('shouldShow — until_done', () => {
  it('keeps showing despite an old seenAt (returns until completed)', () => {
    expect(shouldShow('until_done', { seenAt: ago(100 * HOUR) }, NOW)).toBe(true)
  })
  it('rests for 12h after a dismissal', () => {
    expect(shouldShow('until_done', { dismissedAt: ago(2 * HOUR) }, NOW)).toBe(false)
    expect(shouldShow('until_done', { dismissedAt: ago(13 * HOUR) }, NOW)).toBe(true)
  })
  it('completedAt stops it', () => {
    expect(shouldShow('until_done', { completedAt: ago(HOUR) }, NOW)).toBe(false)
  })
})

describe('shouldShow — per_session', () => {
  it('shows when nothing within 2h', () => {
    expect(shouldShow('per_session', { seenAt: ago(3 * HOUR) }, NOW)).toBe(true)
  })
  it('hides when seen or dismissed within 2h', () => {
    expect(shouldShow('per_session', { seenAt: ago(HOUR) }, NOW)).toBe(false)
    expect(shouldShow('per_session', { dismissedAt: ago(HOUR) }, NOW)).toBe(false)
  })
})

describe('triggerQualifies', () => {
  const DAY = 24 * HOUR
  const wt = (trigger: WalkthroughTrigger): Walkthrough =>
    ({ trigger } as Walkthrough)
  const ctx = (over: Partial<MemberContext> = {}): MemberContext => ({
    role: 'member',
    createdAt: null,
    meta: null,
    leadsCircle: false,
    seasonStartedAt: null,
    ...over,
  })

  it('manual: everyone qualifies', () => {
    expect(triggerQualifies(wt('manual'), ctx(), NOW)).toBe(true)
  })

  it('new_member: only within the 21-day join window', () => {
    expect(triggerQualifies(wt('new_member'), ctx({ createdAt: ago(3 * DAY) }), NOW)).toBe(true)
    expect(triggerQualifies(wt('new_member'), ctx({ createdAt: ago(30 * DAY) }), NOW)).toBe(false)
    expect(triggerQualifies(wt('new_member'), ctx({ createdAt: null }), NOW)).toBe(false)
  })

  it('role_*: matches the member community_role', () => {
    expect(triggerQualifies(wt('role_host'), ctx({ role: 'host' }), NOW)).toBe(true)
    expect(triggerQualifies(wt('role_host'), ctx({ role: 'member' }), NOW)).toBe(false)
    expect(triggerQualifies(wt('role_guide'), ctx({ role: 'guide' }), NOW)).toBe(true)
    expect(triggerQualifies(wt('role_mentor'), ctx({ role: 'mentor' }), NOW)).toBe(true)
  })

  it('circle_lead: qualifies only when the member leads a circle', () => {
    expect(triggerQualifies(wt('circle_lead'), ctx({ leadsCircle: true }), NOW)).toBe(true)
    expect(triggerQualifies(wt('circle_lead'), ctx({ leadsCircle: false }), NOW)).toBe(false)
  })

  it('season: only while the season is freshly launched (21-day window)', () => {
    expect(triggerQualifies(wt('season'), ctx({ seasonStartedAt: ago(5 * DAY) }), NOW)).toBe(true)
    expect(triggerQualifies(wt('season'), ctx({ seasonStartedAt: ago(30 * DAY) }), NOW)).toBe(false)
    expect(triggerQualifies(wt('season'), ctx({ seasonStartedAt: null }), NOW)).toBe(false)
  })

  it('project: never qualifies (no project-launch concept yet)', () => {
    expect(triggerQualifies(wt('project'), ctx(), NOW)).toBe(false)
  })
})

describe('readProgressMap', () => {
  it('returns {} for junk', () => {
    expect(readProgressMap(null)).toEqual({})
    expect(readProgressMap(undefined)).toEqual({})
    expect(readProgressMap(42)).toEqual({})
    expect(readProgressMap({})).toEqual({})
    expect(readProgressMap({ walkthroughs: 'nope' })).toEqual({})
  })
  it('reads the walkthroughs sub-object', () => {
    const meta = { walkthroughs: { 'host-101': { seenAt: ago(HOUR) } } }
    expect(readProgressMap(meta)['host-101'].seenAt).toBeDefined()
  })
})
