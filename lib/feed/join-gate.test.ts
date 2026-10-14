import { describe, expect, it } from 'vitest'
import { FEED_PREVIEW_MS, previewRemainingMs, previewStartedAt } from '@/lib/feed/join-gate'

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
