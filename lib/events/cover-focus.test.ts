import { describe, it, expect } from 'vitest'
import {
  readEventCoverFocus,
  writeEventCoverFocus,
  eventCoverFocusStyle,
} from './cover-focus'
import { DEFAULT_OBJECT_POSITION } from '@/lib/images/focal-point'

describe('readEventCoverFocus', () => {
  it('reads a stored focal point off the theme bag', () => {
    expect(readEventCoverFocus({ coverFocus: '50% 12%' })).toBe('50% 12%')
  })

  it('falls back to centered for an absent, empty, or non-object theme', () => {
    expect(readEventCoverFocus(null)).toBe(DEFAULT_OBJECT_POSITION)
    expect(readEventCoverFocus(undefined)).toBe(DEFAULT_OBJECT_POSITION)
    expect(readEventCoverFocus({})).toBe(DEFAULT_OBJECT_POSITION)
    expect(readEventCoverFocus({ coverFocus: '   ' })).toBe(DEFAULT_OBJECT_POSITION)
    expect(readEventCoverFocus({ coverFocus: 42 })).toBe(DEFAULT_OBJECT_POSITION)
    expect(readEventCoverFocus('not a theme')).toBe(DEFAULT_OBJECT_POSITION)
  })

  it('ignores the sibling heroHeight key', () => {
    expect(readEventCoverFocus({ heroHeight: 'tall' })).toBe(DEFAULT_OBJECT_POSITION)
    expect(readEventCoverFocus({ heroHeight: 'tall', coverFocus: '20% 80%' })).toBe('20% 80%')
  })
})

describe('writeEventCoverFocus', () => {
  it('stores a moved focal point and preserves other theme keys', () => {
    expect(writeEventCoverFocus({ heroHeight: 'tall' }, '50% 10%')).toEqual({
      heroHeight: 'tall',
      coverFocus: '50% 10%',
    })
  })

  it('drops the key when the focus is the centered default', () => {
    expect(writeEventCoverFocus({ heroHeight: 'tall', coverFocus: '50% 10%' }, '50% 50%')).toEqual({
      heroHeight: 'tall',
    })
  })
})

describe('eventCoverFocusStyle', () => {
  it('applies a stored focal point as a CSS object-position', () => {
    expect(eventCoverFocusStyle('50% 12%')).toEqual({ objectPosition: '50% 12%' })
  })

  it('keeps the centered crop when the event carries no focus', () => {
    expect(eventCoverFocusStyle(null)).toEqual({ objectPosition: DEFAULT_OBJECT_POSITION })
    expect(eventCoverFocusStyle(undefined)).toEqual({ objectPosition: DEFAULT_OBJECT_POSITION })
    expect(eventCoverFocusStyle('')).toEqual({ objectPosition: DEFAULT_OBJECT_POSITION })
    expect(eventCoverFocusStyle('   ')).toEqual({ objectPosition: DEFAULT_OBJECT_POSITION })
  })

  it('round-trips the stored theme value a card renders from', () => {
    const theme = writeEventCoverFocus({}, '50% 8%')
    expect(eventCoverFocusStyle(readEventCoverFocus(theme))).toEqual({ objectPosition: '50% 8%' })
  })

  it('matches the hero: the same theme yields the same object-position on every surface', () => {
    const theme = { coverFocus: '35% 15%' }
    const heroStyle = { objectPosition: readEventCoverFocus(theme) }
    expect(eventCoverFocusStyle(readEventCoverFocus(theme))).toEqual(heroStyle)
  })
})
