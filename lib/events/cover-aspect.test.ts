import { describe, it, expect } from 'vitest'
import {
  COVER_ASPECT_MAX,
  COVER_ASPECT_MIN,
  measureCoverAspect,
  normalizeCoverAspect,
  readEventCoverAspect,
  writeEventCoverAspect,
} from './cover-aspect'
import { readEventCoverFocus, writeEventCoverFocus } from './cover-focus'
import { readEventHeroHeight } from './hero-height'

describe('normalizeCoverAspect', () => {
  it('accepts a sane ratio and rounds float noise away', () => {
    expect(normalizeCoverAspect(1)).toBe(1)
    expect(normalizeCoverAspect(1400 / 600)).toBe(2.3333)
    expect(normalizeCoverAspect('1.5')).toBe(1.5)
  })

  it('treats anything outside the bounds, or not a number, as absent', () => {
    expect(normalizeCoverAspect(COVER_ASPECT_MIN - 0.01)).toBeNull()
    expect(normalizeCoverAspect(COVER_ASPECT_MAX + 0.01)).toBeNull()
    expect(normalizeCoverAspect(0)).toBeNull()
    expect(normalizeCoverAspect(-1)).toBeNull()
    expect(normalizeCoverAspect(NaN)).toBeNull()
    expect(normalizeCoverAspect(Infinity)).toBeNull()
    expect(normalizeCoverAspect(null)).toBeNull()
    expect(normalizeCoverAspect(undefined)).toBeNull()
    expect(normalizeCoverAspect('wide')).toBeNull()
    expect(normalizeCoverAspect({ w: 1 })).toBeNull()
  })

  it('keeps the two bounds themselves', () => {
    expect(normalizeCoverAspect(COVER_ASPECT_MIN)).toBe(COVER_ASPECT_MIN)
    expect(normalizeCoverAspect(COVER_ASPECT_MAX)).toBe(COVER_ASPECT_MAX)
  })
})

describe('measureCoverAspect', () => {
  it('is width over height, from what the browser decoded', () => {
    expect(measureCoverAspect(1400, 600)).toBe(2.3333)
    expect(measureCoverAspect(1024, 1024)).toBe(1)
    expect(measureCoverAspect(681, 1024)).toBe(0.665)
  })

  it('reports a failed decode (zero or missing dimensions) as null, never as a ratio', () => {
    expect(measureCoverAspect(0, 0)).toBeNull()
    expect(measureCoverAspect(0, 600)).toBeNull()
    expect(measureCoverAspect(1400, 0)).toBeNull()
    expect(measureCoverAspect(NaN, 600)).toBeNull()
  })
})

describe('readEventCoverAspect', () => {
  it('reads a stored aspect off the theme bag', () => {
    expect(readEventCoverAspect({ coverAspect: 2.3333 })).toBe(2.3333)
  })

  it('falls back to null for an absent, malformed, or non-object theme', () => {
    expect(readEventCoverAspect(null)).toBeNull()
    expect(readEventCoverAspect(undefined)).toBeNull()
    expect(readEventCoverAspect({})).toBeNull()
    expect(readEventCoverAspect({ coverAspect: 'tall' })).toBeNull()
    expect(readEventCoverAspect({ coverAspect: 99 })).toBeNull()
    expect(readEventCoverAspect('not a theme')).toBeNull()
  })

  it('ignores the sibling coverFocus and heroHeight keys', () => {
    expect(readEventCoverAspect({ coverFocus: '50% 12%', heroHeight: 'tall' })).toBeNull()
  })
})

describe('writeEventCoverAspect', () => {
  it('stores the aspect and preserves every other theme key', () => {
    expect(writeEventCoverAspect({ heroHeight: 'tall', coverFocus: '50% 10%' }, 1.5)).toEqual({
      heroHeight: 'tall',
      coverFocus: '50% 10%',
      coverAspect: 1.5,
    })
  })

  it('drops the key on null or an unusable value, so a stale shape never survives a failed measure', () => {
    expect(writeEventCoverAspect({ heroHeight: 'tall', coverAspect: 1.5 }, null)).toEqual({ heroHeight: 'tall' })
    expect(writeEventCoverAspect({ coverAspect: 1.5 }, 42)).toEqual({})
  })

  it('round-trips: what the browser measured is what the band reads', () => {
    const theme = writeEventCoverAspect({}, measureCoverAspect(1400, 600))
    expect(readEventCoverAspect(theme)).toBe(2.3333)
  })

  it('composes with the focus writer on the same bag without either losing the other', () => {
    const theme = writeEventCoverAspect(writeEventCoverFocus({ heroHeight: 'short' }, '50% 8%'), 1)
    expect(readEventCoverFocus(theme)).toBe('50% 8%')
    expect(readEventCoverAspect(theme)).toBe(1)
    expect(readEventHeroHeight(theme)).toBe('short')
  })
})
