import { describe, expect, it } from 'vitest'
import { FEED_PREVIEW_MS, anonFeedHrefAllowed, previewRemainingMs, previewStartedAt } from '@/lib/feed/join-gate'

describe('the Feed preview join prompt', () => {
  it('gives a signed-out visitor 30 seconds', () => {
    expect(FEED_PREVIEW_MS).toBe(30_000)
    expect(previewRemainingMs(1_000, 1_000)).toBe(30_000)
  })

  it('keeps the clock across a reload in the same tab', () => {
    const started = previewStartedAt('1000', 21_000)
    expect(started).toBe(1_000)
    expect(previewRemainingMs(started, 21_000)).toBe(10_000)
  })

  it('opens at once when the time is already spent, never counting below zero', () => {
    expect(previewRemainingMs(1_000, 90_000)).toBe(0)
  })

  it('starts fresh on a missing, garbled or future stamp', () => {
    expect(previewStartedAt(null, 5_000)).toBe(5_000)
    expect(previewStartedAt('nope', 5_000)).toBe(5_000)
    expect(previewStartedAt('9000', 5_000)).toBe(5_000)
  })
})

describe('the anonymous Feed (SCAN-889)', () => {
  it('lets a visitor read the Feed, its sort lens and the public site', () => {
    for (const href of ['/', '/feed', '/feed?sort=recent', '/events', '/events/full-moon-sit', '/discover', '/discover/circles/x', '/help/start', '#main']) {
      expect(anonFeedHrefAllowed(href), href).toBe(true)
    }
  })

  it('sends every account-only door to the join overlay instead', () => {
    for (const href of ['/people/anonymous', '/messages', '/practices', '/circles', '/events/new', '/events/x/manage', '/settings', '/crew/store', '/join', '/sign-in', '/feed/123', 'https://elsewhere.example/feed', '', null]) {
      expect(anonFeedHrefAllowed(href), String(href)).toBe(false)
    }
  })
})
