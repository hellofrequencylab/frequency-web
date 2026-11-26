import { describe, expect, it } from 'vitest'
import { inQuietHours, ladderKey, ladderStillDue, quietEndsAt } from './ladder'

const LA = 'America/Los_Angeles'

describe('ladderStillDue', () => {
  it('stops once every notice on the thread is read or cleared', () => {
    expect(ladderStillDue([{ readAt: '2026-11-24T10:00:00Z', archivedAt: null }, { readAt: null, archivedAt: '2026-11-24T10:00:00Z' }])).toBe(false)
    expect(ladderStillDue([{ readAt: null, archivedAt: null }])).toBe(true)
    expect(ladderStillDue([])).toBe(false)
  })
})

describe('ladderKey', () => {
  it('folds a burst in one thread into one email per half hour', () => {
    const t = Date.parse('2026-11-24T10:01:00Z')
    expect(ladderKey('email', 'p', 'plan:x', t)).toBe(ladderKey('email', 'p', 'plan:x', t + 20 * 60 * 1000))
    expect(ladderKey('email', 'p', 'plan:x', t)).not.toBe(ladderKey('email', 'p', 'plan:y', t))
  })
})

describe('quiet hours', () => {
  const quiet = { start: 22, end: 7, timeZone: LA }
  it('wraps midnight in the person’s own zone', () => {
    expect(inQuietHours(Date.parse('2026-11-25T07:30:00Z'), quiet)).toBe(true) // 11:30 PM Pacific
    expect(inQuietHours(Date.parse('2026-11-24T20:00:00Z'), quiet)).toBe(false) // noon Pacific
  })
  it('is off when start equals end or unset', () => {
    expect(inQuietHours(Date.parse('2026-11-25T07:30:00Z'), { ...quiet, end: 22 })).toBe(false)
    expect(inQuietHours(Date.parse('2026-11-25T07:30:00Z'), null)).toBe(false)
  })
  it('ends at the next local end hour', () => {
    expect(new Date(quietEndsAt(Date.parse('2026-11-25T07:30:00Z'), quiet)).toISOString()).toBe('2026-11-25T15:00:00.000Z')
  })
})
