import { describe, it, expect } from 'vitest'
import { selectTip, COOLDOWN_MS, type TourState } from './select'
import type { Tip } from './tips'

const tips: Tip[] = [
  { id: 'feed_home', trigger: '/feed', priority: 100, title: '', body: '' },
  { id: 'profile_face', trigger: '/feed', priority: 90, prerequisite: ['feed_home'], title: '', body: '' },
  { id: 'circles_find', trigger: '/circles', priority: 100, title: '', body: '' },
]
const fresh = (): TourState => ({ seen: [], dismissed: [], lastShownAt: null })
const NOW = 1_000_000_000

describe('selectTip', () => {
  it('picks the highest-priority eligible tip on a matching route', () => {
    expect(selectTip(tips, fresh(), '/feed', NOW)?.id).toBe('feed_home')
  })

  it('honors prerequisites (profile_face waits for feed_home)', () => {
    expect(selectTip(tips, { seen: ['feed_home'], dismissed: [], lastShownAt: null }, '/feed', NOW)?.id).toBe('profile_face')
  })

  it('skips seen and dismissed tips', () => {
    const s = { seen: ['feed_home'], dismissed: ['profile_face'], lastShownAt: null }
    expect(selectTip(tips, s, '/feed', NOW)).toBeNull()
  })

  it('returns null on a non-matching route', () => {
    expect(selectTip(tips, fresh(), '/messages', NOW)).toBeNull()
  })

  it('respects the pacing cooldown', () => {
    const recent = { seen: [], dismissed: [], lastShownAt: new Date(NOW - 10_000).toISOString() }
    expect(selectTip(tips, recent, '/feed', NOW)).toBeNull()
    const old = { seen: [], dismissed: [], lastShownAt: new Date(NOW - COOLDOWN_MS - 1).toISOString() }
    expect(selectTip(tips, old, '/feed', NOW)?.id).toBe('feed_home')
  })

  it('matches nested routes (/circles/abc)', () => {
    expect(selectTip(tips, fresh(), '/circles/some-slug', NOW)?.id).toBe('circles_find')
  })
})
