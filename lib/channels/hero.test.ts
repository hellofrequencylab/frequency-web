import { describe, it, expect } from 'vitest'
import {
  readChannelCoverFocus,
  readChannelHeroHeight,
  hasChannelHeroHeight,
  writeChannelCoverFocus,
  writeChannelHeroHeight,
  channelCoverFocusStyle,
} from './hero'

// The Channel header settings live in the topical_channels.theme jsonb bag, the same shape events
// use. What is locked here is (a) totality, since `theme` is untyped jsonb and can hold anything,
// and (b) the ONE place this deliberately diverges from the Event rule: an explicitly chosen
// "standard" height is STORED rather than dropped, because on a Channel the header element config
// competes for the same decision and a dropped key would hand it back silently.

describe('reading a theme bag that could contain anything', () => {
  const junk = [null, undefined, 'a string', 42, [], true]

  it('resolves a centered focus for every non-object theme', () => {
    for (const t of junk) expect(readChannelCoverFocus(t)).toBe('50% 50%')
  })

  it('resolves the standard height for every non-object theme', () => {
    for (const t of junk) expect(readChannelHeroHeight(t)).toBe('standard')
  })

  it('treats a missing, blank or non-string focus as centered', () => {
    expect(readChannelCoverFocus({})).toBe('50% 50%')
    expect(readChannelCoverFocus({ coverFocus: '   ' })).toBe('50% 50%')
    expect(readChannelCoverFocus({ coverFocus: 12 })).toBe('50% 50%')
  })

  it('reads a stored focus, trimmed', () => {
    expect(readChannelCoverFocus({ coverFocus: ' 50% 20% ' })).toBe('50% 20%')
  })

  it('falls back to standard for an unrecognized stored height rather than leaking it through', () => {
    expect(readChannelHeroHeight({ heroHeight: 'enormous' })).toBe('standard')
    expect(readChannelHeroHeight({ heroHeight: 'tall' })).toBe('tall')
  })
})

describe('hasChannelHeroHeight distinguishes a CHOICE from a default', () => {
  it('is false when nothing is stored, so the header element keeps deciding', () => {
    expect(hasChannelHeroHeight({})).toBe(false)
    expect(hasChannelHeroHeight(null)).toBe(false)
    expect(hasChannelHeroHeight({ coverFocus: '50% 10%' })).toBe(false)
  })

  it('is false for an unparseable stored value (that is not a choice either)', () => {
    expect(hasChannelHeroHeight({ heroHeight: 'enormous' })).toBe(false)
  })

  it('is TRUE for an explicitly chosen standard, which is the whole point', () => {
    // If this ever returns false, picking "Standard" on a Channel whose header element says Tall
    // would appear to do nothing at all.
    expect(hasChannelHeroHeight(writeChannelHeroHeight({}, 'standard'))).toBe(true)
  })
})

describe('writing keeps the bag sparse without losing a real choice', () => {
  it('drops a centered focus rather than storing the default', () => {
    expect(writeChannelCoverFocus({}, '50% 50%')).not.toHaveProperty('coverFocus')
  })

  it('stores a real focus', () => {
    expect(writeChannelCoverFocus({}, '50% 10%')).toMatchObject({ coverFocus: '50% 10%' })
  })

  it('STORES an explicit standard height (the documented divergence from events)', () => {
    expect(writeChannelHeroHeight({}, 'standard')).toMatchObject({ heroHeight: 'standard' })
  })

  it('clears the key for an unparseable height instead of persisting nonsense', () => {
    expect(writeChannelHeroHeight({ heroHeight: 'tall' }, 'enormous')).not.toHaveProperty('heroHeight')
  })

  it('never disturbs the sibling key, since both share one bag', () => {
    const withFocus = writeChannelCoverFocus({}, '50% 10%')
    const withBoth = writeChannelHeroHeight(withFocus, 'tall')
    expect(withBoth).toMatchObject({ coverFocus: '50% 10%', heroHeight: 'tall' })
    const focusChanged = writeChannelCoverFocus(withBoth, '20% 80%')
    expect(focusChanged).toMatchObject({ coverFocus: '20% 80%', heroHeight: 'tall' })
  })

  it('never mutates the theme it was handed', () => {
    const original = { heroHeight: 'tall' }
    writeChannelCoverFocus(original, '10% 10%')
    expect(original).toEqual({ heroHeight: 'tall' })
  })
})

describe('channelCoverFocusStyle is total', () => {
  it('never emits a broken object-position', () => {
    for (const v of [null, undefined, '', '   ']) {
      expect(channelCoverFocusStyle(v)).toEqual({ objectPosition: '50% 50%' })
    }
    expect(channelCoverFocusStyle('50% 20%')).toEqual({ objectPosition: '50% 20%' })
  })
})
