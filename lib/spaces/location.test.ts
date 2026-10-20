import { describe, expect, it } from 'vitest'

import { DEFAULT_SPACE_LOCATION_PRECISION, EMPTY_SPACE_LOCATION, normalizeSpaceLocation, resolvePrecision } from './location'

describe('Space location privacy default', () => {
  it('a new location is private', () => {
    expect(DEFAULT_SPACE_LOCATION_PRECISION).toBe('approximate')
    expect(EMPTY_SPACE_LOCATION.precision).toBe('approximate')
    expect(normalizeSpaceLocation({ street: '1 Main St' }).precision).toBe('approximate')
    expect(normalizeSpaceLocation({ precision: 'bogus' }).precision).toBe('approximate')
  })
  it('an owner who chose exact keeps it', () => {
    expect(normalizeSpaceLocation({ precision: 'exact' }).precision).toBe('exact')
  })
  it('reading an unrecognised stored value still fails open to exact', () => {
    expect(resolvePrecision('weird')).toBe('exact')
  })
})
