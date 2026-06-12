import { describe, it, expect } from 'vitest'
import { shouldShow, readProgressMap, type WalkthroughProgress } from './runtime'

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
