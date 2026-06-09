import { describe, it, expect } from 'vitest'
import { currencyForSource, currencyForCriteria } from '@/lib/engagement/currency'

describe('currencyForSource', () => {
  it('internal/on-platform sources earn gems', () => {
    expect(currencyForSource('web')).toBe('gems')
    expect(currencyForSource('system')).toBe('gems')
  })

  it('external / in-person sources earn zaps', () => {
    for (const s of ['task', 'qr', 'nfc', 'geo', 'p2p'] as const) {
      expect(currencyForSource(s)).toBe('zaps')
    }
  })
})

describe('currencyForCriteria', () => {
  it('online milestones pay gems', () => {
    for (const t of ['post_create', 'post_replies', 'welcome_member', 'circle_join', 'reaction', 'daily_login']) {
      expect(currencyForCriteria(t)).toBe('gems')
    }
  })

  it('real-life / outreach milestones pay zaps', () => {
    for (const t of ['event_attend', 'event_host', 'referral', 'task_complete', 'node_capture', 'practice_verified', 'circle_start']) {
      expect(currencyForCriteria(t)).toBe('zaps')
    }
  })

  it('the daily practice streak pays zaps (real-world consistency)', () => {
    expect(currencyForCriteria('practice_streak')).toBe('zaps')
  })

  it('streaks split by what they track', () => {
    expect(currencyForCriteria('streak', { streakType: 'attendance' })).toBe('zaps')
    expect(currencyForCriteria('streak', { streakType: 'hosting' })).toBe('zaps')
    expect(currencyForCriteria('streak', { streakType: 'posting' })).toBe('gems')
    expect(currencyForCriteria('streak', { streakType: 'login' })).toBe('gems')
  })

  it('defaults to gems for unknown/empty criteria', () => {
    expect(currencyForCriteria(null)).toBe('gems')
    expect(currencyForCriteria('something_new')).toBe('gems')
  })
})
