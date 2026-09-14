import { describe, it, expect } from 'vitest'
import {
  ACTIVE_WINDOW_DAYS,
  MIN_AGE_DAYS,
  classifyOnboardingAccount,
  readOnboardingThroughput,
  type OnboardingAccountRow,
} from './throughput'

// LIVE-311. The classifier behind the onboarding-throughput cron, against the three fixtures the
// row named: stuck, completed, dormant. Plus the boundaries, because a reading that is off by a
// day in either direction either pages on every signup or misses the person it exists for.

const NOW = new Date('2026-09-14T04:50:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()

function row(id: string, over: Partial<OnboardingAccountRow> = {}): OnboardingAccountRow {
  return { id, created_at: daysAgo(10), onboarding_completed: false, last_sign_in_at: daysAgo(1), ...over }
}

describe('classifyOnboardingAccount', () => {
  it('a member who keeps signing in and is still not onboarded after three days is STUCK', () => {
    expect(classifyOnboardingAccount(row('stuck'), NOW)).toBe('stuck')
  })

  it('an onboarded member is COMPLETED whatever the dates say', () => {
    expect(classifyOnboardingAccount(row('done', { onboarding_completed: true }), NOW)).toBe('completed')
    expect(
      classifyOnboardingAccount(row('done-old', { onboarding_completed: true, created_at: daysAgo(80), last_sign_in_at: null }), NOW),
    ).toBe('completed')
  })

  it('an account with no sign-in inside the window is DORMANT, not stuck', () => {
    expect(classifyOnboardingAccount(row('gone', { last_sign_in_at: daysAgo(ACTIVE_WINDOW_DAYS + 1) }), NOW)).toBe('dormant')
    expect(classifyOnboardingAccount(row('never', { last_sign_in_at: null }), NOW)).toBe('dormant')
  })

  it('an account younger than the minimum age is FRESH, on either side of the boundary', () => {
    expect(classifyOnboardingAccount(row('new', { created_at: daysAgo(MIN_AGE_DAYS - 0.5) }), NOW)).toBe('fresh')
    expect(classifyOnboardingAccount(row('aged', { created_at: daysAgo(MIN_AGE_DAYS + 0.5) }), NOW)).toBe('stuck')
  })

  it('a sign-in exactly on the window edge still counts as active', () => {
    expect(classifyOnboardingAccount(row('edge', { last_sign_in_at: daysAgo(ACTIVE_WINDOW_DAYS) }), NOW)).toBe('stuck')
  })

  it('a missing or unreadable created_at is treated as old, so it cannot hide a lockout', () => {
    expect(classifyOnboardingAccount(row('nodate', { created_at: null }), NOW)).toBe('stuck')
    expect(classifyOnboardingAccount(row('baddate', { created_at: 'not a date' }), NOW)).toBe('stuck')
  })

  it('honours overridden thresholds', () => {
    const r = row('x', { created_at: daysAgo(2), last_sign_in_at: daysAgo(5) })
    expect(classifyOnboardingAccount(r, NOW, { minAgeDays: 1, activeWindowDays: 7 })).toBe('stuck')
    expect(classifyOnboardingAccount(r, NOW, { minAgeDays: 1, activeWindowDays: 3 })).toBe('dormant')
  })
})

describe('readOnboardingThroughput', () => {
  it('reports the stuck ids oldest first, with every state counted and nothing else in the list', () => {
    const rows = [
      row('stuck-newer', { created_at: daysAgo(5) }),
      row('done', { onboarding_completed: true }),
      row('dormant', { last_sign_in_at: daysAgo(45) }),
      row('fresh', { created_at: daysAgo(1) }),
      row('stuck-older', { created_at: daysAgo(77) }),
    ]
    const reading = readOnboardingThroughput(rows, NOW)
    expect(reading.stuck).toEqual(['stuck-older', 'stuck-newer'])
    expect(reading.counts).toEqual({ stuck: 2, completed: 1, dormant: 1, fresh: 1 })
    expect(reading.scanned).toBe(5)
  })

  it('an empty scan is a clean reading, not an error', () => {
    expect(readOnboardingThroughput([], NOW)).toEqual({
      stuck: [],
      counts: { stuck: 0, fresh: 0, dormant: 0, completed: 0 },
      scanned: 0,
    })
  })
})
