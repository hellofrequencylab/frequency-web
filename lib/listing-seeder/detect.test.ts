import { describe, it, expect } from 'vitest'

import { detectListingKind } from './detect'

describe('detectListingKind', () => {
  it('detects HOUSING with high confidence from rental copy', () => {
    const paste =
      '2 bedroom apartment for rent, $1800/mo. First and last month deposit, 12 month lease. In-unit laundry, off-street parking.'
    const result = detectListingKind(paste)
    expect(result.kind).toBe('housing')
    expect(result.confidence).toBe('high')
  })

  it('detects CLASSIFIEDS with high confidence from a for-sale post', () => {
    const paste = 'Vintage couch for sale, $150 OBO. Brand new condition, cash only, must pick up this weekend.'
    const result = detectListingKind(paste)
    expect(result.kind).toBe('classifieds')
    expect(result.confidence).toBe('high')
  })

  it('returns null on a neutral paste with no signals', () => {
    const paste = 'Hi neighbors, reaching out about the thing we talked about. Message me when you get a chance.'
    const result = detectListingKind(paste)
    expect(result.kind).toBeNull()
    expect(result.confidence).toBe('low')
  })

  it('returns null on a balanced tie (one signal each way)', () => {
    // 'for sale' (classifieds) vs 'bedroom' (housing) — a 1-1 tie, so no confident pick.
    const paste = 'For sale, one bedroom set.'
    const result = detectListingKind(paste)
    expect(result.kind).toBeNull()
    expect(result.confidence).toBe('low')
  })

  it('returns null on an empty paste', () => {
    expect(detectListingKind('')).toEqual({ kind: null, confidence: 'low' })
    expect(detectListingKind('   ')).toEqual({ kind: null, confidence: 'low' })
  })

  it('stays low-confidence when the margin is thin', () => {
    // 'selling' + 'condition' (classifieds, 2) vs 'deposit' (housing, 1): winner clears the hit bar
    // but not the margin bar, so it still picks a kind at low confidence (the form will not preselect).
    const paste = 'Selling it in great condition, small deposit to hold.'
    const result = detectListingKind(paste)
    expect(result.kind).toBe('classifieds')
    expect(result.confidence).toBe('low')
  })
})
