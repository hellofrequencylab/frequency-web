import { describe, it, expect } from 'vitest'
import {
  FREE_PUBLISHED_JOURNEY_LIMIT,
  isPublishedVisibility,
  canPublishAnotherJourney,
  canListJourneyInLibrary,
} from './publish-limits'

describe('isPublishedVisibility', () => {
  it('treats unlisted and public as published, private (and junk) as not', () => {
    expect(isPublishedVisibility('unlisted')).toBe(true)
    expect(isPublishedVisibility('public')).toBe(true)
    expect(isPublishedVisibility('private')).toBe(false)
    expect(isPublishedVisibility(null)).toBe(false)
    expect(isPublishedVisibility('nonsense')).toBe(false)
  })
})

describe('canPublishAnotherJourney', () => {
  it('lets a paid owner publish without limit', () => {
    expect(canPublishAnotherJourney({ paid: true, currentPublishedCount: 0 })).toBe(true)
    expect(canPublishAnotherJourney({ paid: true, currentPublishedCount: 99 })).toBe(true)
  })

  it('caps a free owner at the free limit (1)', () => {
    expect(FREE_PUBLISHED_JOURNEY_LIMIT).toBe(1)
    // first publish: 0 already published -> allowed
    expect(canPublishAnotherJourney({ paid: false, currentPublishedCount: 0 })).toBe(true)
    // second publish: 1 already published -> blocked
    expect(canPublishAnotherJourney({ paid: false, currentPublishedCount: 1 })).toBe(false)
    expect(canPublishAnotherJourney({ paid: false, currentPublishedCount: 5 })).toBe(false)
  })

  it('is fail-safe on a negative count', () => {
    expect(canPublishAnotherJourney({ paid: false, currentPublishedCount: -3 })).toBe(true)
  })
})

describe('canListJourneyInLibrary', () => {
  it('is paid-only (the library is the paid lever)', () => {
    expect(canListJourneyInLibrary({ paid: true })).toBe(true)
    expect(canListJourneyInLibrary({ paid: false })).toBe(false)
  })
})
