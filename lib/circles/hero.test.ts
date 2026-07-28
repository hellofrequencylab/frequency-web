import { describe, it, expect } from 'vitest'
import {
  readCircleCoverFocus,
  readCircleHeroHeight,
  hasCircleHeroHeight,
  writeCircleCoverFocus,
  writeCircleHeroHeight,
  circleCoverFocusStyle,
} from './hero'

// The Circle header settings live in the circles.theme jsonb bag, the same shape events and
// Channels use. What is locked here is (a) totality, since `theme` is untyped jsonb, can hold
// anything, AND may not even exist yet (the reads must be safe before the 20270120000000 migration
// is applied), and (b) the ONE place this deliberately diverges from the Event rule: an explicitly
// chosen "standard" height is STORED rather than dropped, because the Circle page resolves its
// hero through the header element config (resolveHeaderElement, ADR-793) which competes for the
// same decision, and a dropped key would hand it back silently.

describe('reading a theme bag that could contain anything', () => {
  const junk = [null, undefined, 'a string', 42, [], true]

  it('resolves a centered focus for every non-object theme', () => {
    for (const t of junk) expect(readCircleCoverFocus(t)).toBe('50% 50%')
  })

  it('resolves the standard height for every non-object theme', () => {
    for (const t of junk) expect(readCircleHeroHeight(t)).toBe('standard')
  })

  it('treats a missing, blank or non-string focus as centered', () => {
    expect(readCircleCoverFocus({})).toBe('50% 50%')
    expect(readCircleCoverFocus({ coverFocus: '   ' })).toBe('50% 50%')
    expect(readCircleCoverFocus({ coverFocus: 12 })).toBe('50% 50%')
  })

  it('reads a stored focus, trimmed', () => {
    expect(readCircleCoverFocus({ coverFocus: ' 50% 20% ' })).toBe('50% 20%')
  })

  it('falls back to standard for an unrecognized stored height rather than leaking it through', () => {
    expect(readCircleHeroHeight({ heroHeight: 'enormous' })).toBe('standard')
    expect(readCircleHeroHeight({ heroHeight: 'tall' })).toBe('tall')
  })
})

describe('hasCircleHeroHeight distinguishes a CHOICE from a default', () => {
  it('is false when nothing is stored, so the header element keeps deciding', () => {
    expect(hasCircleHeroHeight({})).toBe(false)
    expect(hasCircleHeroHeight(null)).toBe(false)
    expect(hasCircleHeroHeight({ coverFocus: '50% 10%' })).toBe(false)
  })

  it('is false for an unparseable stored value (that is not a choice either)', () => {
    expect(hasCircleHeroHeight({ heroHeight: 'enormous' })).toBe(false)
  })

  it('is TRUE for an explicitly chosen standard, which is the whole point', () => {
    // If this ever returns false, picking "Standard" on a Circle whose header element says Tall
    // would appear to do nothing at all.
    expect(hasCircleHeroHeight(writeCircleHeroHeight({}, 'standard'))).toBe(true)
  })
})

describe('writing keeps the bag sparse without losing a real choice', () => {
  it('drops a centered focus rather than storing the default', () => {
    expect(writeCircleCoverFocus({}, '50% 50%')).not.toHaveProperty('coverFocus')
  })

  it('stores a real focus', () => {
    expect(writeCircleCoverFocus({}, '50% 10%')).toMatchObject({ coverFocus: '50% 10%' })
  })

  it('STORES an explicit standard height (the documented divergence from events)', () => {
    expect(writeCircleHeroHeight({}, 'standard')).toMatchObject({ heroHeight: 'standard' })
  })

  it('clears the key for an unparseable height instead of persisting nonsense', () => {
    expect(writeCircleHeroHeight({ heroHeight: 'tall' }, 'enormous')).not.toHaveProperty('heroHeight')
  })

  it('never disturbs the sibling key, since both share one bag', () => {
    const withFocus = writeCircleCoverFocus({}, '50% 10%')
    const withBoth = writeCircleHeroHeight(withFocus, 'tall')
    expect(withBoth).toMatchObject({ coverFocus: '50% 10%', heroHeight: 'tall' })
    const focusChanged = writeCircleCoverFocus(withBoth, '20% 80%')
    expect(focusChanged).toMatchObject({ coverFocus: '20% 80%', heroHeight: 'tall' })
  })

  it('never mutates the theme it was handed', () => {
    const original = { heroHeight: 'tall' }
    writeCircleCoverFocus(original, '10% 10%')
    expect(original).toEqual({ heroHeight: 'tall' })
  })
})

describe('circleCoverFocusStyle is total', () => {
  it('never emits a broken object-position', () => {
    for (const v of [null, undefined, '', '   ']) {
      expect(circleCoverFocusStyle(v)).toEqual({ objectPosition: '50% 50%' })
    }
    expect(circleCoverFocusStyle('50% 20%')).toEqual({ objectPosition: '50% 20%' })
  })
})
